// dHash perceptual hash (T0 frame gate).
//
// Algorithm (classic difference-hash):
//   1. Downsample to 9x8 grayscale.
//   2. For each row, emit a bit per column = (px[c] > px[c+1] ? 1 : 0).
//   3. 8 rows * 8 bits = 64 bits → 16-char hex string.
//
// Two near-identical screenshots will hash to a small Hamming distance
// (typically 0–6); a brand-new table layout will be distance ≥ 12.
//
// Works with both HTMLCanvasElement and OffscreenCanvas — anywhere a
// CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D can be
// obtained. Used by the capture loop's T0 gate (see plan §2).

export type HashableCanvas = HTMLCanvasElement | OffscreenCanvas;

const HASH_W = 9; // sampled width  (one extra column for the diff)
const HASH_H = 8; // sampled height

/** 2D context retrieval that works for both canvas flavours. */
function get2dContext(
  canvas: HashableCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  // OffscreenCanvas requires the same call but returns a different ctx type.
  // We never use any html-only API on the result, so the union is safe.
  const ctx = (canvas as HTMLCanvasElement).getContext("2d", {
    willReadFrequently: true,
  } as CanvasRenderingContext2DSettings);
  return ctx as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
}

/** Build a small grayscale Uint8 array (HASH_W * HASH_H) from any canvas. */
function downsampleToGray(canvas: HashableCanvas): Uint8Array {
  // Use a scratch OffscreenCanvas where supported; fall back to a plain
  // HTMLCanvasElement when running outside a worker / older runtime.
  const Scratch =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(HASH_W, HASH_H)
      : (() => {
          const c = document.createElement("canvas");
          c.width = HASH_W;
          c.height = HASH_H;
          return c;
        })();

  const sctx = get2dContext(Scratch as HashableCanvas);
  if (!sctx) {
    throw new Error("[frameHash] could not get 2d context on scratch canvas");
  }

  // drawImage on a 2d ctx accepts both HTMLCanvasElement and OffscreenCanvas.
  // We cast to `CanvasImageSource` which is the structural type both satisfy.
  sctx.drawImage(canvas as unknown as CanvasImageSource, 0, 0, HASH_W, HASH_H);
  const { data } = sctx.getImageData(0, 0, HASH_W, HASH_H);

  const gray = new Uint8Array(HASH_W * HASH_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec.601 luma — cheap and fine for hashing.
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return gray;
}

/** Convert a 64-bit big-endian bit array into a 16-char lowercase hex string. */
function bitsToHex(bits: Uint8Array): string {
  // bits is length 64 of 0/1.
  let out = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let b = 0; b < 4; b++) {
      v = (v << 1) | (bits[nibble * 4 + b] & 1);
    }
    out += v.toString(16);
  }
  return out;
}

/**
 * Compute a 64-bit dHash of the given canvas.
 * Returns a 16-char lowercase hex string.
 */
export function computeDHash(canvas: HashableCanvas): string {
  const gray = downsampleToGray(canvas);
  const bits = new Uint8Array(64);
  let bi = 0;
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const left = gray[y * HASH_W + x];
      const right = gray[y * HASH_W + x + 1];
      bits[bi++] = left > right ? 1 : 0;
    }
  }
  return bitsToHex(bits);
}

/**
 * Hamming distance between two equal-length hex hash strings.
 * Inputs that differ in length return Number.POSITIVE_INFINITY so
 * callers treat them as "completely different".
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = parseInt(a[i], 16);
    const xb = parseInt(b[i], 16);
    if (Number.isNaN(xa) || Number.isNaN(xb)) return Number.POSITIVE_INFINITY;
    let diff = xa ^ xb;
    while (diff) {
      d += diff & 1;
      diff >>= 1;
    }
  }
  return d;
}
