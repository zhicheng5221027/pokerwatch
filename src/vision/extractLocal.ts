// T1 orchestrator — local, free, deterministic GameState extraction.
//
// Flow (matches plan §2):
//   1. Resolve the platform layout for the captured frame.
//   2. Crop ROIs: pot, blinds, board[0..4], heroHole[0..1], seats[0..8].
//   3. matchCard() each card ROI → hero hole + community board.
//   4. ocrNumberROI() each numeric ROI → pot, hero stack, per-seat stacks.
//   5. Detect seat occupancy via average luma inside seatBox (a dark/empty
//      seat stays mostly black on Stake.us).
//   6. Compose Partial<GameState>; mark any field whose detection score /
//      OCR confidence is below threshold as `missing`, so the caller can
//      escalate to T2 (llmRepair) with cropped ROIs.
//
// Anything we can't determine locally we omit from the partial state and
// list in `missingFields` — never invent values.

import type { Card, GameState, Seat, Street } from "@/types/game";
import { getPlatform } from "./platforms";
import type { Layout, RelBox } from "./platforms";
import { matchCard } from "./cardTemplates";
import { ocrNumberROI } from "./ocrStacks";

export type FrameBitmap = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export interface ExtractInput {
  bitmap: FrameBitmap;
  platform: string;
  prevState?: Partial<GameState>;
}

export interface ExtractResult {
  partial: Partial<GameState>;
  missingFields: string[];
  /** 0..1 per-field detection confidence (template score or OCR confidence). */
  confidenceMap: Record<string, number>;
}

const CARD_CONF_MIN = 0.78; // CALIBRATION: aligned with cardTemplates.MIN_TEMPLATE_SCORE
const OCR_CONF_MIN = 0.55; // CALIBRATION: tesseract numbers come back ~0.6–0.95 on clean labels
const OCCUPIED_LUMA_MIN = 24; // CALIBRATION: empty seat is near-black; > this means a player plate is rendered.

/** Wrap a bitmap into a 2d-context-bearing canvas for cropping. */
function bitmapToCanvas(
  bitmap: FrameBitmap
): HTMLCanvasElement | OffscreenCanvas {
  // If it's already a canvas, return as-is.
  const maybeCanvas = bitmap as HTMLCanvasElement | OffscreenCanvas;
  if (
    typeof (maybeCanvas as HTMLCanvasElement).getContext === "function" &&
    typeof (maybeCanvas as HTMLCanvasElement).width === "number"
  ) {
    return maybeCanvas;
  }
  // Otherwise it's an ImageBitmap-like — paint it onto a fresh canvas.
  const w = (bitmap as ImageBitmap).width;
  const h = (bitmap as ImageBitmap).height;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : (() => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        })();
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("[extractLocal] could not get 2d ctx");
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
  return canvas;
}

/** Pull an ImageData crop for a relative ROI. Null on degenerate inputs. */
function cropROI(
  source: HTMLCanvasElement | OffscreenCanvas,
  box: RelBox
): ImageData | null {
  const w = (source as HTMLCanvasElement).width;
  const h = (source as HTMLCanvasElement).height;
  const px = Math.max(0, Math.min(w - 1, Math.round(box.x * w)));
  const py = Math.max(0, Math.min(h - 1, Math.round(box.y * h)));
  const pw = Math.max(1, Math.min(w - px, Math.round(box.w * w)));
  const ph = Math.max(1, Math.min(h - py, Math.round(box.h * h)));
  const ctx = (source as HTMLCanvasElement).getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;
  try {
    return ctx.getImageData(px, py, pw, ph);
  } catch {
    return null;
  }
}

/** Average luma across an ImageData crop. Cheap occupancy heuristic. */
function avgLuma(img: ImageData | null): number {
  if (!img) return 0;
  const { data } = img;
  if (data.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return total / (data.length / 4);
}

/** Derive the current street from how many board cards are face-up. */
function streetForBoardCount(n: number): Street {
  if (n === 0) return "preflop";
  if (n === 3) return "flop";
  if (n === 4) return "turn";
  if (n === 5) return "river";
  return "between";
}

export async function extractLocal(input: ExtractInput): Promise<ExtractResult> {
  const { bitmap, platform } = input;
  const canvas = bitmapToCanvas(bitmap);
  const layout: Layout = getPlatform(platform).getLayout(canvas);

  const partial: Partial<GameState> = {
    platform,
    capturedAt: Date.now(),
  };
  const missing: string[] = [];
  const conf: Record<string, number> = {};

  // 1. Hero hole cards -----------------------------------------------------
  const heroHole: Card[] = [];
  for (let i = 0; i < layout.heroHole.length; i++) {
    const crop = cropROI(canvas, layout.heroHole[i]);
    const fieldKey = `myHole[${i}]`;
    if (!crop) {
      missing.push(fieldKey);
      conf[fieldKey] = 0;
      continue;
    }
    try {
      const m = await matchCard(crop);
      conf[fieldKey] = m.score;
      if (m.card && m.score >= CARD_CONF_MIN) {
        heroHole.push(m.card);
      } else {
        missing.push(fieldKey);
      }
    } catch {
      conf[fieldKey] = 0;
      missing.push(fieldKey);
    }
  }
  partial.myHole = heroHole;

  // 2. Board cards ---------------------------------------------------------
  const board: Card[] = [];
  for (let i = 0; i < layout.board.length; i++) {
    const crop = cropROI(canvas, layout.board[i]);
    const fieldKey = `board[${i}]`;
    if (!crop) {
      // Empty slot is normal pre-flop; only flag as missing if other cards
      // exist downstream (best decided by the orchestrator).
      conf[fieldKey] = 0;
      continue;
    }
    // Occupancy gate: if the slot is mostly background, it's empty (flop
    // hasn't come yet for this card). Don't OCR/template empty slots.
    if (avgLuma(crop) < OCCUPIED_LUMA_MIN) {
      conf[fieldKey] = 0;
      continue;
    }
    try {
      const m = await matchCard(crop);
      conf[fieldKey] = m.score;
      if (m.card && m.score >= CARD_CONF_MIN) {
        board.push(m.card);
      } else {
        missing.push(fieldKey);
      }
    } catch {
      conf[fieldKey] = 0;
      missing.push(fieldKey);
    }
  }
  partial.board = board;
  partial.street = streetForBoardCount(board.length);

  // 3. Pot OCR -------------------------------------------------------------
  const potCrop = cropROI(canvas, layout.pot);
  if (potCrop) {
    try {
      const r = await ocrNumberROI(potCrop);
      conf.pot = r.confidence;
      if (r.value !== null && r.confidence >= OCR_CONF_MIN) {
        partial.pot = r.value;
      } else {
        missing.push("pot");
      }
    } catch {
      conf.pot = 0;
      missing.push("pot");
    }
  } else {
    missing.push("pot");
    conf.pot = 0;
  }

  // 4. Per-seat occupancy + stack OCR -------------------------------------
  const seats: Seat[] = [];
  for (const seat of layout.seats) {
    const seatCrop = cropROI(canvas, seat.seatBox);
    const luma = avgLuma(seatCrop);
    const occupied = luma >= OCCUPIED_LUMA_MIN;
    const stackKey = `seat${seat.seatNum}.stack`;

    if (!occupied) {
      seats.push({
        seatNum: seat.seatNum,
        name: null,
        stack: 0,
        inHand: false,
        hasActed: false,
        lastAction: null,
        isHero: false,
        isDealer: false,
      });
      conf[stackKey] = 0;
      continue;
    }

    // Occupied — try to OCR the stack number.
    const stackCrop = cropROI(canvas, seat.stackBox);
    let stackVal = 0;
    if (stackCrop) {
      try {
        const r = await ocrNumberROI(stackCrop);
        conf[stackKey] = r.confidence;
        if (r.value !== null && r.confidence >= OCR_CONF_MIN) {
          stackVal = r.value;
        } else {
          missing.push(stackKey);
        }
      } catch {
        conf[stackKey] = 0;
        missing.push(stackKey);
      }
    } else {
      missing.push(stackKey);
      conf[stackKey] = 0;
    }

    seats.push({
      seatNum: seat.seatNum,
      name: null, // Names are flagged as missing — T2 will fill via vision.
      stack: stackVal,
      inHand: occupied,
      hasActed: false,
      lastAction: null,
      isHero: false,
      isDealer: false,
    });
    // Names come from a separate OCR pass we don't run locally; flag it.
    missing.push(`seat${seat.seatNum}.name`);
  }
  partial.seats = seats;

  // 5. Hero seat / stack — for now, we trust seat 1 as hero on Stake.us
  //    (the layout puts hero bottom-centre). Manual override happens in UI.
  // CALIBRATION: validate that seat 1 == hero on real screenshots.
  const hero = seats.find((s) => s.seatNum === 1) ?? null;
  if (hero) {
    partial.mySeat = hero.seatNum;
    partial.myStack = hero.stack;
    hero.isHero = true;
  } else {
    missing.push("mySeat");
    missing.push("myStack");
  }

  // 6. Things we deliberately leave for T2 / engine layer.
  //    `blinds`, `actionOnSeat`, `myTurn`, `tableId`, etc. all need either
  //    LLM repair or temporal tracking that T1 doesn't have.
  missing.push("blinds", "actionOnSeat", "myTurn", "toCall");

  return {
    partial,
    missingFields: missing,
    confidenceMap: conf,
  };
}
