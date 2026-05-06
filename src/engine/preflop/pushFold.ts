// Nash push-fold approximation for ≤15bb (open-shove from each position).
// Source: standard 9-max Nash push-fold tables, smoothed and bucketed.
// Used when hero's stack is short. The tables widen as stack shrinks.

import type { Position } from "@/types/game";

/**
 * For a given (position, stackBb) we return the set of canonical hand codes
 * that should open-shove. Tables are stored per-stack-bucket: 5/8/10/12/15.
 * Lookup picks the largest bucket ≤ stackBb; below 5bb we use the 5bb range.
 */

type Range = Set<string>;

const make = (...codes: string[][]): Range => new Set(codes.flat());

// Full pair list 22..AA helper
const ALL_PAIRS = [
  "22","33","44","55","66","77","88","99","TT","JJ","QQ","KK","AA",
];

const SUITED_AX = ["A2s","A3s","A4s","A5s","A6s","A7s","A8s","A9s","ATs","AJs","AQs","AKs"];
const OFFSUIT_AX = ["A2o","A3o","A4o","A5o","A6o","A7o","A8o","A9o","ATo","AJo","AQo","AKo"];
const SUITED_KX = ["K2s","K3s","K4s","K5s","K6s","K7s","K8s","K9s","KTs","KJs","KQs"];
const OFFSUIT_KX_8 = ["K8o","K9o","KTo","KJo","KQo"];
const SUITED_QX_8 = ["Q8s","Q9s","QTs","QJs"];

// ---------- BTN tables (loosest) ----------
const BTN_5  = make(ALL_PAIRS, SUITED_AX, OFFSUIT_AX, SUITED_KX, OFFSUIT_KX_8,
  SUITED_QX_8, ["QTo","QJo","JTs","J9s","T9s","98s","87s","76s","65s","54s","T8s","97s","86s","75s","JTo","T9o"]);
const BTN_8  = make(ALL_PAIRS, SUITED_AX, OFFSUIT_AX, SUITED_KX, OFFSUIT_KX_8,
  SUITED_QX_8, ["QTo","QJo","JTs","J9s","T9s","98s","87s","76s","65s","54s"]);
const BTN_10 = make(ALL_PAIRS, SUITED_AX, ["A8o","A9o","ATo","AJo","AQo","AKo"],
  ["K7s","K8s","K9s","KTs","KJs","KQs"], ["KJo","KQo"], ["Q9s","QTs","QJs","QJo"],
  ["JTs","J9s","T9s","98s","87s","76s"]);
const BTN_12 = make(ALL_PAIRS, SUITED_AX, ["A9o","ATo","AJo","AQo","AKo"],
  ["K8s","K9s","KTs","KJs","KQs"], ["KJo","KQo"],
  ["QTs","QJs"], ["JTs","T9s","98s"]);
const BTN_15 = make(ALL_PAIRS.slice(2), SUITED_AX, ["ATo","AJo","AQo","AKo"],
  ["K9s","KTs","KJs","KQs"], ["KJo","KQo"], ["QTs","QJs"], ["JTs"]);

// ---------- CO tables ----------
const CO_5  = make(ALL_PAIRS, SUITED_AX, OFFSUIT_AX, SUITED_KX, OFFSUIT_KX_8,
  SUITED_QX_8, ["QTo","QJo","JTs","T9s","98s","87s","76s","65s","J9s","T8s"]);
const CO_8  = make(ALL_PAIRS, SUITED_AX, ["A5o","A7o","A8o","A9o","ATo","AJo","AQo","AKo"],
  SUITED_KX, ["KTo","KJo","KQo"], ["Q9s","QTs","QJs","QJo"],
  ["JTs","T9s","98s","87s","76s","J9s"]);
const CO_10 = make(ALL_PAIRS, SUITED_AX, ["A8o","A9o","ATo","AJo","AQo","AKo"],
  ["K8s","K9s","KTs","KJs","KQs"], ["KJo","KQo"],
  ["QTs","QJs"], ["JTs","T9s"]);
const CO_12 = make(ALL_PAIRS.slice(1), SUITED_AX, ["A9o","ATo","AJo","AQo","AKo"],
  ["K9s","KTs","KJs","KQs"], ["KQo"], ["QTs","QJs"]);
const CO_15 = make(ALL_PAIRS.slice(2), ["A2s","A3s","A4s","A5s","A7s","A8s","A9s","ATs","AJs","AQs","AKs"],
  ["ATo","AJo","AQo","AKo"], ["KTs","KJs","KQs"], ["KQo"], ["QJs"]);

// ---------- HJ / MP tables (medium) ----------
const HJ_5  = make(ALL_PAIRS, SUITED_AX, ["A2o","A5o","A7o","A8o","A9o","ATo","AJo","AQo","AKo"],
  SUITED_KX, ["KTo","KJo","KQo"], ["Q9s","QTs","QJs","QJo"], ["JTs","T9s","98s","J9s"]);
const HJ_8  = make(ALL_PAIRS, SUITED_AX, ["A8o","A9o","ATo","AJo","AQo","AKo"],
  ["K9s","KTs","KJs","KQs"], ["KJo","KQo"], ["QTs","QJs"], ["JTs","T9s"]);
const HJ_10 = make(ALL_PAIRS, SUITED_AX, ["A9o","ATo","AJo","AQo","AKo"],
  ["KTs","KJs","KQs"], ["KQo"], ["QJs"]);
const HJ_12 = make(ALL_PAIRS.slice(1), ["A2s","A3s","A4s","A5s","A7s","A8s","A9s","ATs","AJs","AQs","AKs"],
  ["ATo","AJo","AQo","AKo"], ["KJs","KQs"], ["KQo"]);
const HJ_15 = make(ALL_PAIRS.slice(2), ["A5s","A8s","A9s","ATs","AJs","AQs","AKs"],
  ["AJo","AQo","AKo"], ["KJs","KQs"], ["KQo"]);

// ---------- UTG tables (tightest) ----------
const UTG_5  = make(ALL_PAIRS, SUITED_AX, ["A8o","A9o","ATo","AJo","AQo","AKo"],
  ["K9s","KTs","KJs","KQs"], ["KJo","KQo"], ["QTs","QJs"], ["JTs","T9s"]);
const UTG_8  = make(ALL_PAIRS, ["A2s","A3s","A4s","A5s","A8s","A9s","ATs","AJs","AQs","AKs"],
  ["A9o","ATo","AJo","AQo","AKo"], ["KTs","KJs","KQs"], ["KQo"], ["QJs"]);
const UTG_10 = make(ALL_PAIRS.slice(1), ["A2s","A5s","A8s","A9s","ATs","AJs","AQs","AKs"],
  ["ATo","AJo","AQo","AKo"], ["KJs","KQs"], ["KQo"]);
const UTG_12 = make(ALL_PAIRS.slice(2), ["A5s","A9s","ATs","AJs","AQs","AKs"],
  ["AJo","AQo","AKo"], ["KQs"]);
const UTG_15 = make(ALL_PAIRS.slice(3), ["A5s","ATs","AJs","AQs","AKs"],
  ["AQo","AKo"], ["KQs"]);

// ---------- SB push-fold (vs BB only) ----------
const SB_5  = BTN_5;
const SB_8  = BTN_8;
const SB_10 = BTN_10;
const SB_12 = BTN_12;
const SB_15 = BTN_15;

const TABLES: Record<Position, Record<5 | 8 | 10 | 12 | 15, Range>> = {
  UTG:  { 5: UTG_5, 8: UTG_8, 10: UTG_10, 12: UTG_12, 15: UTG_15 },
  UTG1: { 5: UTG_5, 8: UTG_8, 10: UTG_10, 12: UTG_12, 15: UTG_15 },
  MP:   { 5: HJ_5,  8: HJ_8,  10: HJ_10,  12: HJ_12,  15: HJ_15  },
  MP1:  { 5: HJ_5,  8: HJ_8,  10: HJ_10,  12: HJ_12,  15: HJ_15  },
  HJ:   { 5: HJ_5,  8: HJ_8,  10: HJ_10,  12: HJ_12,  15: HJ_15  },
  CO:   { 5: CO_5,  8: CO_8,  10: CO_10,  12: CO_12,  15: CO_15  },
  BTN:  { 5: BTN_5, 8: BTN_8, 10: BTN_10, 12: BTN_12, 15: BTN_15 },
  SB:   { 5: SB_5,  8: SB_8,  10: SB_10,  12: SB_12,  15: SB_15  },
  BB:   { 5: new Set(), 8: new Set(), 10: new Set(), 12: new Set(), 15: new Set() },
};

const BUCKETS: ReadonlyArray<5 | 8 | 10 | 12 | 15> = [5, 8, 10, 12, 15];

function pickBucket(stackBb: number): 5 | 8 | 10 | 12 | 15 {
  let chosen: 5 | 8 | 10 | 12 | 15 = 5;
  for (const b of BUCKETS) {
    if (stackBb >= b) chosen = b;
  }
  return chosen;
}

/** Returns true if we should jam this hand at this stack from this position. */
export function shouldShove(
  pos: Position,
  code: string,
  stackBb: number,
): boolean {
  if (stackBb > 15) return false;
  const bucket = pickBucket(stackBb);
  return TABLES[pos][bucket].has(code);
}

/** Whole-range view for debugging / display. */
export function pushRange(
  pos: Position,
  stackBb: number,
): Set<string> {
  if (stackBb > 15) return new Set();
  return TABLES[pos][pickBucket(stackBb)];
}

/** Are we in push-fold land (≤15bb effective)? */
export function isPushFoldStack(stackBb: number): boolean {
  return stackBb <= 15;
}
