// Board texture classifier per strategy doc §3.1.
// Returns flags useful for sizing and prompt generation.

import type { Card, Rank } from "@/types/game";
import { rankOf, rankValue, suitOf } from "../cards";

export interface BoardTexture {
  /** 0..1; higher is wetter/more dynamic */
  wetness: number;
  paired: boolean;
  trips: boolean;          // three of a kind on board
  monotone: boolean;       // all same suit (≥3 cards)
  twoTone: boolean;        // exactly two of one suit
  rainbow: boolean;        // all different suits (3+ cards)
  /** 0..1 for connectivity (gaps between ranks) */
  connectedness: number;
  /** highest card rank on the board */
  highCard: Rank | null;
  isAceHigh: boolean;
  hasFlushDraw: boolean;
  hasOpenEnder: boolean;   // open-ended straight draw (4 cards in a row possible)
  /** Convenience label for prompts. */
  label:
    | "dry-ace-high"
    | "dry-low"
    | "two-tone-connected"
    | "monotone"
    | "paired"
    | "broadway-dynamic"
    | "wet"
    | "unknown";
}

/** Classify a 0..5 card board. Empty board returns label "unknown" with flags off. */
export function classifyBoard(cards: Card[]): BoardTexture {
  const tx: BoardTexture = {
    wetness: 0,
    paired: false,
    trips: false,
    monotone: false,
    twoTone: false,
    rainbow: false,
    connectedness: 0,
    highCard: null,
    isAceHigh: false,
    hasFlushDraw: false,
    hasOpenEnder: false,
    label: "unknown",
  };

  if (cards.length === 0) return tx;

  // Rank counts
  const rankCounts = new Map<Rank, number>();
  for (const c of cards) {
    const r = rankOf(c);
    rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  }
  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  tx.paired = counts[0] >= 2;
  tx.trips = counts[0] >= 3;

  // Suit counts
  const suitCounts = new Map<string, number>();
  for (const c of cards) {
    const s = suitOf(c);
    suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
  }
  const sCounts = [...suitCounts.values()].sort((a, b) => b - a);
  if (cards.length >= 3) {
    tx.monotone = sCounts[0] >= 3;
    tx.twoTone = sCounts[0] === 2 && (sCounts[1] ?? 0) <= 2;
    tx.rainbow = sCounts[0] === 1; // every card different suit
    tx.hasFlushDraw = tx.monotone || sCounts[0] === 2;
  } else if (cards.length === 2) {
    tx.hasFlushDraw = sCounts[0] === 2;
    tx.twoTone = sCounts[0] === 2;
  }

  // High card
  const sortedDesc = [...cards].sort(
    (a, b) => rankValue(rankOf(b)) - rankValue(rankOf(a)),
  );
  tx.highCard = rankOf(sortedDesc[0]);
  tx.isAceHigh = tx.highCard === "A";

  // Connectedness: closer ranks → higher score.
  const uniqueRanks = [...new Set(cards.map((c) => rankValue(rankOf(c))))]
    .sort((a, b) => b - a);
  if (uniqueRanks.length >= 2) {
    const span = uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1];
    // span 2 (e.g. 9-7) or 4 (T-6) etc. Smaller span = more connected.
    // For 3 unique ranks span 2 ⇒ 1.0; span 12 ⇒ 0.
    const maxSpan = 12;
    tx.connectedness = Math.max(0, 1 - span / maxSpan);
  }

  // Open-ender presence on the flop: any 4-card straight possible with one more card?
  tx.hasOpenEnder = hasOpenEnderOnBoard(uniqueRanks);

  // Wetness heuristic
  const broadwayHits = cards.filter(
    (c) => rankValue(rankOf(c)) >= 10,
  ).length;
  tx.wetness =
    0.35 * (tx.connectedness) +
    (tx.monotone ? 0.4 : tx.twoTone ? 0.2 : 0) +
    (tx.hasOpenEnder ? 0.2 : 0) +
    (broadwayHits >= 2 ? 0.15 : 0);
  tx.wetness = Math.min(1, tx.wetness);

  // Pick a label
  if (tx.paired) tx.label = "paired";
  else if (tx.monotone) tx.label = "monotone";
  else if (tx.isAceHigh && tx.connectedness < 0.4 && !tx.twoTone) tx.label = "dry-ace-high";
  else if (broadwayHits >= 2 && tx.connectedness >= 0.6) tx.label = "broadway-dynamic";
  else if (tx.twoTone && tx.connectedness >= 0.5) tx.label = "two-tone-connected";
  else if (tx.connectedness < 0.3 && !tx.twoTone) tx.label = "dry-low";
  else tx.label = "wet";

  return tx;
}

/**
 * Is there a 4-card-in-a-row straight possibility given the board ranks?
 * Looks at any window of 5 consecutive ranks where the board fills 3 of them
 * with no double-counting; that's the canonical "OESD on board" definition.
 */
function hasOpenEnderOnBoard(uniqueRankValues: number[]): boolean {
  if (uniqueRankValues.length < 3) return false;
  const present = new Set<number>(uniqueRankValues);
  // Ace can also play low (1) for wheel checks.
  if (present.has(14)) present.add(1);
  for (let lo = 1; lo <= 11; lo++) {
    let count = 0;
    for (let i = lo; i < lo + 4; i++) if (present.has(i)) count++;
    if (count >= 3) return true;
  }
  return false;
}
