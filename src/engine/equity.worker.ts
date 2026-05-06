// Comlink-exposed Monte Carlo equity worker.
// Hero hole vs. an assumed range vs. board, finishing the runout.
// ~2000 trials default. Pure deterministic except for RNG.
//
// NOTE: this file is intended to be run in a Web Worker context via Comlink.
// We dynamic-import comlink only at the bottom so unit tests can import the
// pure functions without spinning up a worker.

import type { Card } from "@/types/game";
import { deckMinus, parseCard } from "./cards";

/* ----------------------------- hand evaluator ----------------------------- */
//
// Lightweight 7-card evaluator. Returns a comparable integer where higher
// is better. Categories (×10^9):
//   8 straight flush
//   7 four of a kind
//   6 full house
//   5 flush
//   4 straight
//   3 three of a kind
//   2 two pair
//   1 one pair
//   0 high card
// Ties broken by kickers packed into the lower digits.

const CATEGORY = 1_000_000_000;

function rankNum(c: Card): number {
  // 2..14
  const r = c[0];
  if (r === "T") return 10;
  if (r === "J") return 11;
  if (r === "Q") return 12;
  if (r === "K") return 13;
  if (r === "A") return 14;
  return parseInt(r, 10);
}

function suitNum(c: Card): number {
  switch (c[1]) {
    case "s": return 0;
    case "h": return 1;
    case "d": return 2;
    default:  return 3; // c
  }
}

function bestStraightHigh(rankBits: number): number {
  // Bit layout: bit i = rank (i+2). bit 0 = 2, bit 12 = A.
  // For a straight high X: window of 5 consecutive bits ending at bit (X-2).
  for (let hi = 14; hi >= 6; hi--) {
    const top = hi - 2;
    const winMask = ((1 << 5) - 1) << (top - 4);
    if ((rankBits & winMask) === winMask) return hi;
  }
  // Wheel A-2-3-4-5: bits for A(12), 2(0), 3(1), 4(2), 5(3).
  const wheelMask = (1 << 12) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
  if ((rankBits & wheelMask) === wheelMask) return 5;
  return 0;
}

/** Evaluate a 7-card hand. Returns a comparable integer score. */
export function evaluate7(cards: Card[]): number {
  // counts per rank (2..14 → idx 0..12)
  const rCount = new Array(15).fill(0); // 0..14, ignore 0/1
  const sCount = [0, 0, 0, 0];
  const sRanks: number[][] = [[], [], [], []]; // ranks per suit
  let rankBits = 0;
  for (const c of cards) {
    const r = rankNum(c);
    const s = suitNum(c);
    rCount[r]++;
    sCount[s]++;
    sRanks[s].push(r);
    rankBits |= 1 << (r - 2);
  }

  // Flush?
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sCount[s] >= 5) { flushSuit = s; break; }

  // Straight flush check
  if (flushSuit >= 0) {
    let fbits = 0;
    for (const r of sRanks[flushSuit]) fbits |= 1 << (r - 2);
    const sfHigh = bestStraightHigh(fbits);
    if (sfHigh > 0) return 8 * CATEGORY + sfHigh;
  }

  // Quads / full house / trips / pairs
  const fours: number[] = [];
  const threes: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rCount[r] === 4) fours.push(r);
    else if (rCount[r] === 3) threes.push(r);
    else if (rCount[r] === 2) pairs.push(r);
  }

  // Quads
  if (fours.length) {
    const quad = fours[0];
    let kicker = 0;
    for (let r = 14; r >= 2; r--) if (r !== quad && rCount[r] > 0) { kicker = r; break; }
    return 7 * CATEGORY + quad * 100 + kicker;
  }

  // Full house: trips + pair (or another trips used as pair)
  if (threes.length >= 1) {
    const trip = threes[0];
    let pairForFh = 0;
    if (threes.length >= 2) pairForFh = threes[1];
    if (pairs.length >= 1) pairForFh = Math.max(pairForFh, pairs[0]);
    if (pairForFh > 0) return 6 * CATEGORY + trip * 100 + pairForFh;
  }

  // Flush
  if (flushSuit >= 0) {
    const fr = sRanks[flushSuit].slice().sort((a, b) => b - a).slice(0, 5);
    return 5 * CATEGORY +
      fr[0] * 14 ** 4 + fr[1] * 14 ** 3 + fr[2] * 14 ** 2 + fr[3] * 14 + fr[4];
  }

  // Straight
  const straightHigh = bestStraightHigh(rankBits);
  if (straightHigh > 0) return 4 * CATEGORY + straightHigh;

  // Trips
  if (threes.length) {
    const trip = threes[0];
    const kickers: number[] = [];
    for (let r = 14; r >= 2 && kickers.length < 2; r--) {
      if (r === trip) continue;
      if (rCount[r] > 0) kickers.push(r);
    }
    return 3 * CATEGORY + trip * 14 ** 2 + (kickers[0] ?? 0) * 14 + (kickers[1] ?? 0);
  }

  // Two pair
  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    let kicker = 0;
    for (let r = 14; r >= 2; r--) if (r !== hi && r !== lo && rCount[r] > 0) { kicker = r; break; }
    return 2 * CATEGORY + hi * 14 ** 2 + lo * 14 + kicker;
  }

  // One pair
  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers: number[] = [];
    for (let r = 14; r >= 2 && kickers.length < 3; r--) {
      if (r === p) continue;
      if (rCount[r] > 0) kickers.push(r);
    }
    return 1 * CATEGORY + p * 14 ** 3 + (kickers[0] ?? 0) * 14 ** 2 + (kickers[1] ?? 0) * 14 + (kickers[2] ?? 0);
  }

  // High card
  const top: number[] = [];
  for (let r = 14; r >= 2 && top.length < 5; r--) if (rCount[r] > 0) top.push(r);
  return top[0] * 14 ** 4 + top[1] * 14 ** 3 + top[2] * 14 ** 2 + top[3] * 14 + top[4];
}

/* ------------------------------ deck shuffle ----------------------------- */

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/* --------------------------- equity vs range ----------------------------- */

export interface EquityVsRangeInput {
  hero: [Card, Card];
  /** Each entry is a 2-card combo for villain. The sim picks one uniformly. */
  villainCombos?: Array<[Card, Card]>;
  board: Card[]; // 0..5 cards
  trials?: number; // default 2000
  seed?: number;
}

export interface EquityVsRangeResult {
  /** 0..100 */
  equity: number;
  win: number;
  tie: number;
  loss: number;
  trials: number;
}

function makeRng(seed: number): () => number {
  // Mulberry32
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function equityVsRange({
  hero,
  villainCombos,
  board,
  trials = 2000,
  seed,
}: EquityVsRangeInput): EquityVsRangeResult {
  const heroCards = hero.map((c) => parseCard(c)) as [Card, Card];
  const boardCards = board.map((c) => parseCard(c));
  const rng = makeRng(seed ?? Math.floor(Math.random() * 2 ** 31));

  let win = 0, tie = 0, loss = 0;
  for (let t = 0; t < trials; t++) {
    // Pick villain combo
    let villain: [Card, Card] | null = null;
    if (villainCombos && villainCombos.length) {
      // Reject combos that conflict with hero/board.
      let attempts = 0;
      while (attempts < 20) {
        const cand = villainCombos[Math.floor(rng() * villainCombos.length)];
        const dead = new Set([...heroCards, ...boardCards]);
        if (!dead.has(cand[0]) && !dead.has(cand[1]) && cand[0] !== cand[1]) {
          villain = [cand[0], cand[1]];
          break;
        }
        attempts++;
      }
      if (!villain) continue;
    } else {
      // Random villain hand from remaining deck.
      const deck = deckMinus([...heroCards, ...boardCards]);
      shuffleInPlace(deck, rng);
      villain = [deck[0], deck[1]];
    }

    // Complete the board to 5 cards
    const deadFor = [...heroCards, ...boardCards, ...villain];
    const deck2 = deckMinus(deadFor);
    shuffleInPlace(deck2, rng);
    const need = 5 - boardCards.length;
    const fullBoard = [...boardCards, ...deck2.slice(0, need)];

    const heroScore = evaluate7([...heroCards, ...fullBoard]);
    const villScore = evaluate7([...villain, ...fullBoard]);
    if (heroScore > villScore) win++;
    else if (heroScore === villScore) tie++;
    else loss++;
  }

  const total = win + tie + loss || 1;
  const equity = ((win + tie / 2) / total) * 100;
  return { equity, win, tie, loss, trials: total };
}

/* --------------------------- comlink expose ------------------------------ */
// Expose only when running inside a worker. Guarded so unit tests can import.
const isWorker =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as { importScripts?: unknown }).importScripts === "function";

if (isWorker) {
  // Lazy import; not needed in node test runs.
  void import("comlink").then(({ expose }) => {
    expose({ equityVsRange });
  });
}
