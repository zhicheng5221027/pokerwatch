// tesseract.js wrapper for stack / pot ROI OCR.
//
// Exposes:
//   * createWorkerPool(size) — lazily-allocated round-robin tesseract pool.
//   * ocr — a default size-2 pool consumed by `extractLocal`.
//   * ocrNumberROI(crop) — recognises a number string in the crop and
//                          parses it into a numeric value.
//
// Robustness:
//   * In a test/non-browser environment where tesseract.js can't init
//     (no DOM, no fetch, no workers), `ocrNumberROI` resolves with
//     `{ value: null, confidence: 0 }` so callers can fall back to T2.
//   * Workers are created on first use and re-used; `disposePool()` is
//     exposed so consumers can clean up.

import type { Worker as TesseractWorker } from "tesseract.js";

const NUMBER_WHITELIST = "0123456789,.bbBBgcGCkmKM";

/** What ocrNumberROI resolves to. */
export interface OcrNumberResult {
  /** Parsed numeric value (chips). null if recognition failed. */
  value: number | null;
  /** 0..1 — tesseract's reported confidence on the recognised line. */
  confidence: number;
  /** The raw recognised text, useful for debugging. */
  raw?: string;
}

/** A pool of tesseract workers we can round-robin requests across. */
export interface WorkerPool {
  ocrNumber: (crop: ImageDataLike) => Promise<OcrNumberResult>;
  dispose: () => Promise<void>;
}

/** Anything tesseract.recognize() will accept. We type loosely so the OCR
 *  module remains decoupled from the canvas type used upstream. */
export type ImageDataLike =
  | ImageData
  | HTMLCanvasElement
  | OffscreenCanvas
  | HTMLImageElement
  | string; // dataURL or URL

/** Try to import tesseract.js. Returns null in environments where the
 *  package can't be loaded (test stubs, SSR). */
async function tryImportTesseract(): Promise<typeof import("tesseract.js") | null> {
  try {
    // Vite resolves this dynamic import at runtime; node-test envs that
    // don't have the package will just resolve to null.
    const mod = await import("tesseract.js");
    return mod;
  } catch {
    return null;
  }
}

interface InternalWorker {
  worker: TesseractWorker;
  busy: boolean;
}

async function createWorker(): Promise<InternalWorker | null> {
  const tess = await tryImportTesseract();
  if (!tess) return null;
  try {
    const worker = await tess.createWorker("eng");
    // tesseract.js types are strict about pageseg_mode, but the underlying
    // engine happily accepts the string form. Cast through `unknown` to
    // satisfy the TS checker without pulling in the PSM enum at compile time.
    await worker.setParameters({
      tessedit_char_whitelist: NUMBER_WHITELIST,
      // Treat the ROI as a single line; pot/stack labels are one row.
      tessedit_pageseg_mode: "7",
    } as unknown as Parameters<TesseractWorker["setParameters"]>[0]);
    return { worker, busy: false };
  } catch {
    return null;
  }
}

/**
 * Parse a tesseract'd label like "1,234", "12.5K", "1.2M", "750bb" into a
 * raw chip count. Returns null if nothing numeric is recognisable.
 */
export function parseChipString(raw: string): number | null {
  if (!raw) return null;
  // Strip spaces, normalise commas.
  const cleaned = raw.trim().replace(/,/g, "");
  // Pull the first number-ish token + optional suffix.
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*([kKmMbBgGcC]{0,2})/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] || "").toLowerCase();

  if (suffix.includes("m")) return n * 1_000_000;
  if (suffix.includes("k")) return n * 1_000;
  // "bb" / "gc" / "sc" suffixes have no multiplier; the engine layer
  // is responsible for converting BB-denominated values when relevant.
  return n;
}

/**
 * Build a pool of `size` tesseract workers. Returns immediately with a
 * facade; workers are created lazily on first OCR call.
 */
export function createWorkerPool(size = 2): WorkerPool {
  const workers: InternalWorker[] = [];
  let initialised = false;
  let initPromise: Promise<void> | null = null;

  async function init(): Promise<void> {
    if (initialised) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      for (let i = 0; i < size; i++) {
        const w = await createWorker();
        if (w) workers.push(w);
      }
      initialised = true;
    })();
    return initPromise;
  }

  async function pickWorker(): Promise<InternalWorker | null> {
    await init();
    if (workers.length === 0) return null;
    // Cheap polling round-robin; sufficient for the 1–2 ROI/sec workload.
    for (let attempt = 0; attempt < 20; attempt++) {
      const free = workers.find((w) => !w.busy);
      if (free) return free;
      await new Promise((r) => setTimeout(r, 25));
    }
    // Fall back to first worker even if busy — tesseract serialises internally.
    return workers[0];
  }

  async function ocrNumber(crop: ImageDataLike): Promise<OcrNumberResult> {
    const slot = await pickWorker();
    if (!slot) {
      return { value: null, confidence: 0 };
    }
    slot.busy = true;
    try {
      const res = await slot.worker.recognize(
        crop as unknown as Parameters<TesseractWorker["recognize"]>[0]
      );
      const text = res?.data?.text ?? "";
      const confidence =
        typeof res?.data?.confidence === "number"
          ? res.data.confidence / 100
          : 0;
      const value = parseChipString(text);
      return { value, confidence, raw: text };
    } catch {
      return { value: null, confidence: 0 };
    } finally {
      slot.busy = false;
    }
  }

  async function dispose(): Promise<void> {
    await Promise.all(
      workers.map(async (w) => {
        try {
          await w.worker.terminate();
        } catch {
          /* ignore */
        }
      })
    );
    workers.length = 0;
    initialised = false;
    initPromise = null;
  }

  return { ocrNumber, dispose };
}

/** Default shared pool used by extractLocal. */
export const ocr: WorkerPool = createWorkerPool(2);

/** Convenience entry: OCR a single crop and return a numeric reading. */
export async function ocrNumberROI(
  crop: ImageDataLike
): Promise<OcrNumberResult> {
  return ocr.ocrNumber(crop);
}
