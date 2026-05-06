// Card template matcher.
//
// The real implementation will:
//   1. Lazily load 52 PNG sprites from `/platforms/stake-us/cards/<Rank><Suit>.png`
//      (e.g. `As.png`, `Td.png`). Each sprite is the canonical rank+suit
//      glyph as it appears on Stake.us cards, sized roughly to the ROI.
//   2. For each candidate sprite:
//        - Resize sprite to crop dimensions (or vice-versa).
//        - Convert both to grayscale.
//        - Compute Sum-of-Absolute-Differences (SAD) over pixels.
//        - score = 1 - (SAD / max_possible_SAD)
//   3. Return the best-scoring card if score >= MIN_TEMPLATE_SCORE
//      (suggested 0.78), else `{ card: null, score: best_score }` so the
//      orchestrator can flag the field as missing.
//
// Today, the sprite library does not exist yet. To keep the rest of the
// pipeline runnable (and unit-testable), this module:
//   * exposes the final-shape API,
//   * tries to fetch each sprite and silently treats 404s as "template absent",
//   * falls back to a no-op stub that returns `{ card: null, score: 0 }`.
//
// The grayscale SAD utility is implemented here so the real version is a
// drop-in: just provide the sprites and flip MIN_TEMPLATE_SCORE.

import type { Card, Rank, Suit } from "@/types/game";

const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
];
const SUITS: readonly Suit[] = ["s", "h", "d", "c"];

export const ALL_CARDS: readonly Card[] = (() => {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(`${r}${s}` as Card);
  return out;
})();

export interface MatchResult {
  card: Card | null;
  score: number; // 0..1
}

const MIN_TEMPLATE_SCORE = 0.78; // CALIBRATION: tune once we have real sprites.
const TEMPLATE_BASE = "/platforms/stake-us/cards"; // resolves under public/.

// In-memory cache of decoded template ImageData. Keys are card strings.
const templateCache = new Map<Card, ImageData | null>();

/** Convert raw RGBA bytes to a flat Uint8Array of luma values. */
function toGrayscale(data: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return out;
}

/** Sum-of-Absolute-Differences score normalised to 0..1 (1 = identical). */
function sadScore(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sad = 0;
  for (let i = 0; i < a.length; i++) sad += Math.abs(a[i] - b[i]);
  const maxSad = a.length * 255;
  return 1 - sad / maxSad;
}

/**
 * Lazy-load a single template. Returns null if the sprite isn't reachable
 * (404 / network error / non-browser env), so callers can degrade gracefully.
 */
async function loadTemplate(card: Card): Promise<ImageData | null> {
  if (templateCache.has(card)) return templateCache.get(card) ?? null;

  // In Node test envs, `fetch` may not exist or `Image` may not work.
  // Bail out clean — a missing template is the same as a stub.
  if (typeof fetch !== "function" || typeof Image === "undefined") {
    templateCache.set(card, null);
    return null;
  }

  try {
    const url = `${TEMPLATE_BASE}/${card}.png`;
    const res = await fetch(url);
    if (!res.ok) {
      templateCache.set(card, null);
      return null;
    }
    const blob = await res.blob();
    const bmp =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(blob)
        : null;
    if (!bmp) {
      templateCache.set(card, null);
      return null;
    }
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : (() => {
            const c = document.createElement("canvas");
            c.width = bmp.width;
            c.height = bmp.height;
            return c;
          })();
    const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      templateCache.set(card, null);
      return null;
    }
    ctx.drawImage(bmp as unknown as CanvasImageSource, 0, 0);
    const imgData = ctx.getImageData(0, 0, bmp.width, bmp.height);
    templateCache.set(card, imgData);
    return imgData;
  } catch {
    templateCache.set(card, null);
    return null;
  }
}

/**
 * Match a card-shaped image crop against the sprite library.
 * Returns the best-scoring card, or `{ card: null, score: 0 }` when
 * no templates are available (the current default state).
 *
 * TODO(real-impl): the inner loop here is structurally complete; once
 * the 52 PNG sprites land in `public/platforms/stake-us/cards/`, this
 * function will start returning real matches without API changes.
 */
export async function matchCard(crop: ImageData): Promise<MatchResult> {
  if (!crop || crop.width === 0 || crop.height === 0) {
    return { card: null, score: 0 };
  }

  const cropGray = toGrayscale(crop.data);

  let best: MatchResult = { card: null, score: 0 };
  let anyTemplate = false;

  for (const card of ALL_CARDS) {
    const tmpl = await loadTemplate(card);
    if (!tmpl) continue;
    anyTemplate = true;

    // Templates and crops should already be the same size — caller is
    // expected to pre-resize. If they differ, skip safely rather than
    // throw (this also keeps the unit-test path exception-free).
    if (tmpl.width !== crop.width || tmpl.height !== crop.height) continue;

    const tGray = toGrayscale(tmpl.data);
    const score = sadScore(cropGray, tGray);
    if (score > best.score) best = { card, score };
  }

  if (!anyTemplate) {
    // Stub mode — sprite library not deployed yet.
    return { card: null, score: 0 };
  }

  if (best.score < MIN_TEMPLATE_SCORE) {
    return { card: null, score: best.score };
  }
  return best;
}

/** Test hook — clear the in-memory template cache. */
export function _resetTemplateCache(): void {
  templateCache.clear();
}
