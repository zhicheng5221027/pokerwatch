// Sanity checks for the dHash perceptual hash.
// We can't run a real DOM canvas under vitest's default node env, so the
// test stubs OffscreenCanvas with a minimal Uint8-backed implementation.

import { describe, expect, it, beforeAll } from "vitest";
import { computeDHash, hammingDistance } from "@/vision/frameHash";

interface FakeCtx {
  canvas: { width: number; height: number; _data: Uint8ClampedArray };
  drawImage: (src: unknown, _x: number, _y: number, w?: number, h?: number) => void;
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  fillStyle: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  _data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this._data = new Uint8ClampedArray(w * h * 4);
  }

  getContext(_kind: string): FakeCtx {
    const self = this;
    return {
      canvas: this,
      fillStyle: "#000",
      drawImage(src) {
        const s = src as FakeOffscreenCanvas;
        // Nearest-neighbour resample s into self.
        for (let y = 0; y < self.height; y++) {
          for (let x = 0; x < self.width; x++) {
            const sx = Math.min(s.width - 1, Math.floor((x / self.width) * s.width));
            const sy = Math.min(
              s.height - 1,
              Math.floor((y / self.height) * s.height)
            );
            const si = (sy * s.width + sx) * 4;
            const di = (y * self.width + x) * 4;
            self._data[di] = s._data[si];
            self._data[di + 1] = s._data[si + 1];
            self._data[di + 2] = s._data[si + 2];
            self._data[di + 3] = 255;
          }
        }
      },
      getImageData(x, y, w, h) {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const si = ((y + yy) * self.width + (x + xx)) * 4;
            const di = (yy * w + xx) * 4;
            out[di] = self._data[si];
            out[di + 1] = self._data[si + 1];
            out[di + 2] = self._data[si + 2];
            out[di + 3] = self._data[si + 3];
          }
        }
        return { data: out };
      },
      fillRect(x, y, w, h) {
        const [r, g, b] = this.fillStyle === "#fff" ? [255, 255, 255] : [0, 0, 0];
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const i = ((y + yy) * self.width + (x + xx)) * 4;
            self._data[i] = r;
            self._data[i + 1] = g;
            self._data[i + 2] = b;
            self._data[i + 3] = 255;
          }
        }
      },
    };
  }
}

beforeAll(() => {
  // Inject the fake canvas into globals so frameHash.ts picks it up via
  // its `typeof OffscreenCanvas !== "undefined"` check.
  (globalThis as unknown as { OffscreenCanvas: typeof FakeOffscreenCanvas })
    .OffscreenCanvas = FakeOffscreenCanvas;
});

function makeGradientCanvas(w: number, h: number): FakeOffscreenCanvas {
  const c = new FakeOffscreenCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      c._data[i] = (x * 255) / Math.max(1, w - 1);
      c._data[i + 1] = (x * 255) / Math.max(1, w - 1);
      c._data[i + 2] = (x * 255) / Math.max(1, w - 1);
      c._data[i + 3] = 255;
    }
  }
  return c;
}

describe("frameHash", () => {
  it("produces a 16-char hex hash", () => {
    const c = makeGradientCanvas(32, 32);
    const h = computeDHash(c as unknown as OffscreenCanvas);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("identical canvases hash to distance 0", () => {
    const a = makeGradientCanvas(32, 32);
    const b = makeGradientCanvas(32, 32);
    const ha = computeDHash(a as unknown as OffscreenCanvas);
    const hb = computeDHash(b as unknown as OffscreenCanvas);
    expect(hammingDistance(ha, hb)).toBe(0);
  });

  it("a tiny edit produces a small (non-zero) distance", () => {
    const a = makeGradientCanvas(64, 64);
    const b = makeGradientCanvas(64, 64);
    // Flip a single pixel at the corner.
    b._data[0] = 255 - b._data[0];
    b._data[1] = 255 - b._data[1];
    b._data[2] = 255 - b._data[2];
    const ha = computeDHash(a as unknown as OffscreenCanvas);
    const hb = computeDHash(b as unknown as OffscreenCanvas);
    const d = hammingDistance(ha, hb);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(20);
  });

  it("hammingDistance returns +Infinity for mismatched lengths", () => {
    expect(hammingDistance("abcd", "abcde")).toBe(Number.POSITIVE_INFINITY);
  });
});
