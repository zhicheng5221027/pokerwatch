// Preflop range tables (100bb baseline) per strategy-foundations §2.
// All ranges expand into a flat Set<string> of canonical hand codes
// like "AA", "AKs", "AKo". Match against `holeToCode(cards)` from cards.ts.

import type { Position, Rank } from "@/types/game";
import { RANKS } from "../cards";

const rankIdx = (r: Rank): number => RANKS.indexOf(r);

/** Pocket pairs from `min` and up. expandPairsFrom("88") → 88,99,TT,JJ,QQ,KK,AA. */
function expandPairsFrom(min: Rank): string[] {
  const start = rankIdx(min);
  const out: string[] = [];
  for (let i = start; i < RANKS.length; i++) {
    const r = RANKS[i];
    out.push(`${r}${r}`);
  }
  return out;
}

/** Pocket pair single, e.g. "TT". */
function pair(r: Rank): string {
  return `${r}${r}`;
}

/**
 * Expand "AXs+" / "KXs+" patterns: the high card stays fixed, kicker iterates
 * from `kickerMin` up to (but not equal to) the high rank.
 * suited=true → "s", false → "o".
 *
 * Example: expandKickers("A","2","s") → A2s,A3s,...,AKs.
 */
function expandKickers(
  high: Rank,
  kickerMin: Rank,
  suited: boolean,
): string[] {
  const hi = rankIdx(high);
  const lo = rankIdx(kickerMin);
  const out: string[] = [];
  for (let i = lo; i < hi; i++) {
    const k = RANKS[i];
    out.push(`${high}${k}${suited ? "s" : "o"}`);
  }
  return out;
}

/**
 * Expand suited connectors / one-gappers between two ranks (inclusive).
 * Both endpoints suited. e.g. range("9","6","s") → 98s,87s,76s,65s.
 * The first rank is the higher one.
 */
function suitedRun(highStart: Rank, highEnd: Rank): string[] {
  const start = rankIdx(highStart);
  const end = rankIdx(highEnd);
  const out: string[] = [];
  for (let i = start; i >= end; i--) {
    const hi = RANKS[i];
    const lo = RANKS[i - 1];
    if (!lo) break;
    out.push(`${hi}${lo}s`);
  }
  return out;
}

const set = (...arrs: string[][]): Set<string> =>
  new Set(arrs.flat());

// =====================================================================
// RFI (raise first in) ranges by position. Reference: strategy doc §2.
// =====================================================================

const UTG_RFI = set(
  expandPairsFrom("8"),                    // 88+
  expandKickers("A", "J", true),           // AJs+
  ["KQs"],
  expandKickers("A", "Q", false),          // AQo+
);

const MP_RFI = set(
  expandPairsFrom("7"),                    // 77+
  expandKickers("A", "T", true),           // ATs+
  expandKickers("K", "J", true),           // KJs+
  ["QJs"],
  expandKickers("A", "J", false),          // AJo+
  ["KQo"],
);

const CO_RFI = set(
  expandPairsFrom("5"),                    // 55+
  expandKickers("A", "8", true),           // A8s+
  expandKickers("K", "9", true),           // K9s+
  expandKickers("Q", "9", true),           // Q9s+
  ["JTs", "T9s"],
  expandKickers("A", "T", false),          // ATo+
  expandKickers("K", "J", false),          // KJo+
  ["QJo"],
);

const BTN_RFI = set(
  expandPairsFrom("2"),                    // 22+
  expandKickers("A", "2", true),           // A2s+
  expandKickers("K", "5", true),           // K5s+
  expandKickers("Q", "7", true),           // Q7s+
  expandKickers("J", "7", true),           // J7s+
  expandKickers("T", "7", true),           // T7s+
  ["97s", "98s"],                          // 97s+
  ["86s", "87s"],                          // 86s+
  ["75s", "76s"],                          // 75s+
  ["65s", "54s"],
  expandKickers("A", "8", false),          // A8o+
  expandKickers("K", "9", false),          // K9o+
  expandKickers("Q", "9", false),          // Q9o+
  expandKickers("J", "9", false),          // J9o+
  ["T9o"],
);

const SB_RFI = set(
  expandPairsFrom("2"),                    // 22+
  expandKickers("A", "2", true),           // A2s+
  expandKickers("K", "7", true),           // K7s+
  expandKickers("Q", "9", true),           // Q9s+
  ["J9s", "JTs"],
  ["T9s", "98s"],
  expandKickers("A", "9", false),          // A9o+
  expandKickers("K", "J", false),          // KJo+
  ["QJo"],
);

// BB defends very wide; we don't materialize it as RFI (BB never opens RFI).
const BB_DEFEND_VS_BTN_OPEN = set(
  expandPairsFrom("2"),
  expandKickers("A", "2", true),
  expandKickers("K", "5", true),
  expandKickers("Q", "7", true),
  expandKickers("J", "7", true),
  expandKickers("T", "7", true),
  ["97s", "98s", "86s", "87s", "75s", "76s", "65s", "54s", "43s"],
  expandKickers("A", "2", false),
  expandKickers("K", "8", false),
  expandKickers("Q", "9", false),
  expandKickers("J", "9", false),
  ["T9o", "98o"],
);

const RFI: Record<Position, Set<string>> = {
  UTG: UTG_RFI,
  UTG1: UTG_RFI,
  MP: MP_RFI,
  MP1: MP_RFI,
  HJ: MP_RFI,
  CO: CO_RFI,
  BTN: BTN_RFI,
  SB: SB_RFI,
  BB: new Set(), // BB never opens RFI; uses defend ranges instead
};

export function rfiRange(pos: Position): Set<string> {
  return RFI[pos];
}

export function isInRfi(pos: Position, code: string): boolean {
  return RFI[pos].has(code);
}

// =====================================================================
// Vs-raise ranges. We split into "value 3bet", "bluff 3bet", "call".
// Source ranges are simplified per strategy doc §2.
// =====================================================================

const VALUE_3BET = set([pair("Q"), pair("K"), pair("A"), "AKs", "AKo"]);

const BLUFF_3BET = set(["A5s", "A4s"]);

const CALL_VS_RAISE_IP = set(
  ["22", "33", "44", "55", "66", "77", "88", "99"],
  ["AQs", "AJs", "ATs", "KQs", "KJs", "QJs", "JTs", "T9s", "98s", "87s", "76s"],
  ["AQo", "KQo"],
);

// OOP: defend tighter; mostly value 3-bet or fold
const CALL_VS_RAISE_OOP = set(
  ["77", "88", "99", "TT", "JJ"],
  ["AQs", "AJs", "KQs"],
);

export interface VsRaiseDecision {
  kind: "raise" | "call" | "fold";
}

/**
 * Versus a single open-raise. `inPosition` matters for cold-call width.
 */
export function vsRaise(
  code: string,
  inPosition: boolean,
): VsRaiseDecision {
  if (VALUE_3BET.has(code)) return { kind: "raise" };
  if (BLUFF_3BET.has(code)) return { kind: "raise" };
  const callSet = inPosition ? CALL_VS_RAISE_IP : CALL_VS_RAISE_OOP;
  if (callSet.has(code)) return { kind: "call" };
  return { kind: "fold" };
}

// =====================================================================
// Vs-3bet ranges. Hero already opened; villain 3-bet.
// =====================================================================

const VALUE_4BET = set([pair("K"), pair("A"), "AKs"]);
const MIX_4BET   = set([pair("J"), "AKo"]);
const BLUFF_4BET = set(["A5s", "A4s"]);

const CALL_VS_3BET_IP = set(
  ["77", "88", "99", "TT", "JJ", "QQ"],
  ["AQs", "AJs", "ATs", "KQs", "KJs", "QJs", "JTs"],
  ["AQo"],
);

const CALL_VS_3BET_OOP = set(
  ["TT", "JJ", "QQ"],
  ["AQs", "AJs", "KQs"],
);

export interface Vs3BetDecision {
  kind: "raise" | "call" | "fold" | "mix";
}

export function vs3Bet(code: string, inPosition: boolean): Vs3BetDecision {
  if (VALUE_4BET.has(code)) return { kind: "raise" };
  if (BLUFF_4BET.has(code)) return { kind: "raise" };
  if (MIX_4BET.has(code)) return { kind: "mix" };
  const callSet = inPosition ? CALL_VS_3BET_IP : CALL_VS_3BET_OOP;
  if (callSet.has(code)) return { kind: "call" };
  return { kind: "fold" };
}

// =====================================================================
// BB defend exposed as a public utility for the decide() entrypoint.
// =====================================================================
export function bbDefendVsLatePos(): Set<string> {
  return BB_DEFEND_VS_BTN_OPEN;
}
