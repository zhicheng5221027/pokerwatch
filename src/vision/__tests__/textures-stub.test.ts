// Smoke test for `extractLocal` shape contract.
// We can't run real tesseract or template matching in vitest, so we mock
// the dependencies and verify that the orchestrator returns a Partial<GameState>
// with the expected fields (arrays for board / myHole, seats array, etc.).

import { describe, expect, it, vi, beforeAll } from "vitest";

// --- Stub OffscreenCanvas BEFORE importing extractLocal --------------------
class FakeOffscreenCanvas {
  width: number;
  height: number;
  _data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this._data = new Uint8ClampedArray(w * h * 4);
    // Fill with mid-grey so seat occupancy detection thinks every seat is filled.
    for (let i = 0; i < this._data.length; i += 4) {
      this._data[i] = 90;
      this._data[i + 1] = 90;
      this._data[i + 2] = 90;
      this._data[i + 3] = 255;
    }
  }
  getContext(_kind: string) {
    const self = this;
    return {
      canvas: self,
      drawImage() {
        /* stub */
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const si = ((y + yy) * self.width + (x + xx)) * 4;
            const di = (yy * w + xx) * 4;
            out[di] = self._data[si] ?? 0;
            out[di + 1] = self._data[si + 1] ?? 0;
            out[di + 2] = self._data[si + 2] ?? 0;
            out[di + 3] = 255;
          }
        }
        return { data: out, width: w, height: h };
      },
    };
  }
}

beforeAll(() => {
  (globalThis as unknown as { OffscreenCanvas: typeof FakeOffscreenCanvas })
    .OffscreenCanvas = FakeOffscreenCanvas;
});

// --- Mock the heavy modules -----------------------------------------------
vi.mock("@/vision/cardTemplates", () => ({
  matchCard: vi.fn(async () => ({ card: null, score: 0 })),
  ALL_CARDS: [],
  _resetTemplateCache: () => {
    /* noop */
  },
}));

vi.mock("@/vision/ocrStacks", () => ({
  ocr: { ocrNumber: async () => ({ value: null, confidence: 0 }), dispose: async () => {} },
  ocrNumberROI: async () => ({ value: null, confidence: 0 }),
  parseChipString: () => null,
  createWorkerPool: () => ({
    ocrNumber: async () => ({ value: null, confidence: 0 }),
    dispose: async () => {},
  }),
}));

import { extractLocal } from "@/vision/extractLocal";

describe("extractLocal — shape contract", () => {
  it("returns the documented shape for a stake.us frame", async () => {
    const canvas = new FakeOffscreenCanvas(1280, 720);
    const result = await extractLocal({
      bitmap: canvas as unknown as OffscreenCanvas,
      platform: "stake.us",
    });

    expect(result).toBeDefined();
    expect(result.partial).toBeDefined();
    expect(result.missingFields).toBeInstanceOf(Array);
    expect(result.confidenceMap).toBeTypeOf("object");

    // Partial<GameState> sanity:
    expect(result.partial.platform).toBe("stake.us");
    expect(Array.isArray(result.partial.board)).toBe(true);
    expect(Array.isArray(result.partial.myHole)).toBe(true);
    expect(Array.isArray(result.partial.seats)).toBe(true);

    // 9 seat slots are always emitted (occupancy is per-seat).
    expect(result.partial.seats?.length).toBe(9);

    // With our stubs, no card was matched — myHole/board should be empty arrays.
    expect(result.partial.myHole?.length).toBe(0);
    expect(result.partial.board?.length).toBe(0);

    // Street is preflop when board is empty.
    expect(result.partial.street).toBe("preflop");

    // Some always-missing fields are flagged for the T2 stage.
    expect(result.missingFields).toContain("blinds");
    expect(result.missingFields).toContain("myTurn");
  });

  it("falls back to the generic layout for unknown platforms", async () => {
    const canvas = new FakeOffscreenCanvas(800, 600);
    const result = await extractLocal({
      bitmap: canvas as unknown as OffscreenCanvas,
      platform: "totally-unknown",
    });
    expect(result.partial.platform).toBe("totally-unknown");
    expect(result.partial.seats?.length).toBe(9);
  });
});
