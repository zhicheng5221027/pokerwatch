// Generic 9-max table ROI map — fallback when the platform is unknown.
//
// Coords are even rougher than stakeUs.ts; expect lower confidence and more
// frequent T2 fallbacks. Most numbers below are CALIBRATION guesses.

import type { Layout, RelBox, SeatROI } from "./stakeUs";

export type { Layout, RelBox, SeatROI };

// CALIBRATION: pot in the centre, just above the board.
const POT: RelBox = { x: 0.42, y: 0.36, w: 0.16, h: 0.04 };

// CALIBRATION: blinds / stake label top-left.
const BLINDS: RelBox = { x: 0.05, y: 0.05, w: 0.20, h: 0.04 };

// CALIBRATION: 5 board cards centred horizontally.
const BOARD_CARD_W = 0.06;
const BOARD_CARD_H = 0.12;
const BOARD_GAP = 0.014;
const BOARD_TOTAL_W = 5 * BOARD_CARD_W + 4 * BOARD_GAP;
const BOARD_X0 = 0.5 - BOARD_TOTAL_W / 2;
const BOARD_Y = 0.44;

const BOARD = [0, 1, 2, 3, 4].map((i) => ({
  x: BOARD_X0 + i * (BOARD_CARD_W + BOARD_GAP),
  y: BOARD_Y,
  w: BOARD_CARD_W,
  h: BOARD_CARD_H,
})) as [RelBox, RelBox, RelBox, RelBox, RelBox];

// CALIBRATION: hero hole cards bottom centre.
const HERO_CARD_W = 0.07;
const HERO_CARD_H = 0.14;
const HERO_GAP = 0.014;
const HERO_TOTAL_W = 2 * HERO_CARD_W + HERO_GAP;
const HERO_X0 = 0.5 - HERO_TOTAL_W / 2;
const HERO_Y = 0.68;

const HERO_HOLE: [RelBox, RelBox] = [
  { x: HERO_X0, y: HERO_Y, w: HERO_CARD_W, h: HERO_CARD_H },
  { x: HERO_X0 + HERO_CARD_W + HERO_GAP, y: HERO_Y, w: HERO_CARD_W, h: HERO_CARD_H },
];

// CALIBRATION: 9 evenly-spaced seat plates around the felt.
const SEAT_W = 0.14;
const SEAT_H = 0.09;

const SEAT_CENTERS = [
  { cx: 0.50, cy: 0.84 }, // 1 hero
  { cx: 0.26, cy: 0.80 }, // 2
  { cx: 0.09, cy: 0.60 }, // 3
  { cx: 0.09, cy: 0.34 }, // 4
  { cx: 0.30, cy: 0.14 }, // 5
  { cx: 0.50, cy: 0.08 }, // 6
  { cx: 0.70, cy: 0.14 }, // 7
  { cx: 0.91, cy: 0.34 }, // 8
  { cx: 0.91, cy: 0.60 }, // 9
];

const SEATS: SeatROI[] = SEAT_CENTERS.map((c, i) => {
  const seatBox: RelBox = {
    x: c.cx - SEAT_W / 2,
    y: c.cy - SEAT_H / 2,
    w: SEAT_W,
    h: SEAT_H,
  };
  return {
    seatNum: i + 1,
    seatBox,
    nameBox: {
      x: seatBox.x,
      y: seatBox.y,
      w: seatBox.w,
      h: seatBox.h * 0.5,
    },
    stackBox: {
      x: seatBox.x,
      y: seatBox.y + seatBox.h * 0.5,
      w: seatBox.w,
      h: seatBox.h * 0.5,
    },
  };
});

const BASE_LAYOUT: Layout = {
  pot: POT,
  blinds: BLINDS,
  board: BOARD,
  heroHole: HERO_HOLE,
  seats: SEATS,
};

export function getLayout(_canvas: HTMLCanvasElement | OffscreenCanvas): Layout {
  return BASE_LAYOUT;
}

export const genericLayout = BASE_LAYOUT;
