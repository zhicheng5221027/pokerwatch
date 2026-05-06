// Stake.us NLHE table ROI map.
//
// All coords are RELATIVE to the captured frame (0..1 in both axes), so the
// same map works at 1280x720, 1600x900, 1920x1080, etc. Numbers were eyeballed
// from a 1920x1080 reference layout where the felt covers ~middle 60% width
// and ~50% height; refine once we have a real screenshot.
//
// Coordinate system (matches DOM canvas): x grows right, y grows down.
// A `Box` is the relative top-left + size; `toPixels` resolves it.
//
// CALIBRATION: every value below tagged with `// CALIBRATION:` is a guess
// and should be re-measured against a real Stake.us NLHE PokerVerse capture.

export interface RelBox {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeatROI {
  seatNum: number; // 1..9
  seatBox: RelBox; // whole seat plate (used for occupancy luma test)
  nameBox: RelBox; // name label area
  stackBox: RelBox; // chip stack number area
}

export interface Layout {
  /** Relative ROIs — multiply by canvas w/h to get pixels. */
  pot: RelBox;
  /** Blinds / stake label, usually top-left of table. */
  blinds: RelBox;
  /** 5 community card slots, left-to-right. */
  board: [RelBox, RelBox, RelBox, RelBox, RelBox];
  /** Hero hole cards — 2 slots. Stake.us shows them at the bottom centre. */
  heroHole: [RelBox, RelBox];
  /** Up to 9 seats. We always emit 9 even on 6-max layouts; the occupancy
   *  detector in extractLocal decides which are filled. */
  seats: SeatROI[];
}

/** Convert a relative box to absolute pixel coords for the given canvas. */
export function toPixels(
  box: RelBox,
  canvas: HTMLCanvasElement | OffscreenCanvas
): PixelBox {
  const w = (canvas as HTMLCanvasElement).width;
  const h = (canvas as HTMLCanvasElement).height;
  return {
    x: Math.round(box.x * w),
    y: Math.round(box.y * h),
    w: Math.round(box.w * w),
    h: Math.round(box.h * h),
  };
}

// CALIBRATION: pot label sits just above the board, centered. 1920x1080 → ~ (820, 380, 280, 36).
const POT: RelBox = { x: 0.428, y: 0.352, w: 0.146, h: 0.034 };

// CALIBRATION: blinds/stake text top-left of table.
const BLINDS: RelBox = { x: 0.06, y: 0.06, w: 0.18, h: 0.04 };

// CALIBRATION: 5 board cards centered horizontally around y=0.46, ~7% of frame width per card with small gaps.
const BOARD_CARD_W = 0.06;
const BOARD_CARD_H = 0.12;
const BOARD_GAP = 0.012;
const BOARD_TOTAL_W = 5 * BOARD_CARD_W + 4 * BOARD_GAP;
const BOARD_X0 = 0.5 - BOARD_TOTAL_W / 2;
const BOARD_Y = 0.42;

const BOARD: [RelBox, RelBox, RelBox, RelBox, RelBox] = [0, 1, 2, 3, 4].map(
  (i) => ({
    x: BOARD_X0 + i * (BOARD_CARD_W + BOARD_GAP),
    y: BOARD_Y,
    w: BOARD_CARD_W,
    h: BOARD_CARD_H,
  })
) as [RelBox, RelBox, RelBox, RelBox, RelBox];

// CALIBRATION: hero hole cards centred at bottom, ~62% y, slightly larger than board cards.
const HERO_CARD_W = 0.07;
const HERO_CARD_H = 0.14;
const HERO_GAP = 0.012;
const HERO_TOTAL_W = 2 * HERO_CARD_W + HERO_GAP;
const HERO_X0 = 0.5 - HERO_TOTAL_W / 2;
const HERO_Y = 0.66;

const HERO_HOLE: [RelBox, RelBox] = [
  { x: HERO_X0, y: HERO_Y, w: HERO_CARD_W, h: HERO_CARD_H },
  { x: HERO_X0 + HERO_CARD_W + HERO_GAP, y: HERO_Y, w: HERO_CARD_W, h: HERO_CARD_H },
];

// CALIBRATION: seat positions for 9-max. Standard Stake.us PokerVerse layout
// places hero at seat 1 (bottom centre) and seats fan out clockwise.
// Each seat plate is ~14% wide, 9% tall.
const SEAT_W = 0.14;
const SEAT_H = 0.09;

interface SeatCenter {
  cx: number;
  cy: number;
}

// CALIBRATION: rough seat anchor centres (bottom-centre = seat1, going clockwise).
const SEAT_CENTERS: SeatCenter[] = [
  { cx: 0.50, cy: 0.83 }, // 1 hero / bottom centre
  { cx: 0.27, cy: 0.80 }, // 2 bottom-left
  { cx: 0.10, cy: 0.62 }, // 3 mid-left
  { cx: 0.10, cy: 0.32 }, // 4 upper-left
  { cx: 0.30, cy: 0.16 }, // 5 top-left
  { cx: 0.50, cy: 0.10 }, // 6 top-centre
  { cx: 0.70, cy: 0.16 }, // 7 top-right
  { cx: 0.90, cy: 0.32 }, // 8 upper-right
  { cx: 0.90, cy: 0.62 }, // 9 mid-right
];

function seatFromCenter(seatNum: number, c: SeatCenter): SeatROI {
  const seatBox: RelBox = {
    x: c.cx - SEAT_W / 2,
    y: c.cy - SEAT_H / 2,
    w: SEAT_W,
    h: SEAT_H,
  };
  // Name occupies top half of the plate, stack the bottom half.
  const nameBox: RelBox = {
    x: seatBox.x,
    y: seatBox.y,
    w: seatBox.w,
    h: seatBox.h * 0.5,
  };
  const stackBox: RelBox = {
    x: seatBox.x,
    y: seatBox.y + seatBox.h * 0.5,
    w: seatBox.w,
    h: seatBox.h * 0.5,
  };
  return { seatNum, seatBox, nameBox, stackBox };
}

const SEATS: SeatROI[] = SEAT_CENTERS.map((c, i) => seatFromCenter(i + 1, c));

const BASE_LAYOUT: Layout = {
  pot: POT,
  blinds: BLINDS,
  board: BOARD,
  heroHole: HERO_HOLE,
  seats: SEATS,
};

/**
 * Returns the relative ROI map. Aspect-ratio-agnostic (relative coords),
 * but exposed as a function so future calibrations can adjust based on
 * canvas size (e.g., a portrait capture would re-map seat positions).
 */
export function getLayout(_canvas: HTMLCanvasElement | OffscreenCanvas): Layout {
  // CALIBRATION: today we ignore the canvas; once we have multiple aspect
  // ratios sampled we should branch on `_canvas.width / _canvas.height`.
  return BASE_LAYOUT;
}

export const stakeUsLayout = BASE_LAYOUT;
