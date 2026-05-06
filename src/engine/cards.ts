// Pure helpers for parsing, comparing, and printing cards.
// A Card is a 2-char string like "As", "Td", "9c", "2h".
import type { Card, Rank, Suit } from "@/types/game";

export const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
] as const;

export const SUITS: readonly Suit[] = ["s", "h", "d", "c"] as const;

/** Numeric rank, 2 → 2 ... A → 14. Useful for sorting / connectivity math. */
export function rankValue(r: Rank): number {
  return RANKS.indexOf(r) + 2;
}

export function rankOf(c: Card): Rank {
  return c[0] as Rank;
}

export function suitOf(c: Card): Suit {
  return c[1] as Suit;
}

/** Parse a candidate string into a Card or throw. Accepts 'As', 'as', '10s'→'Ts'. */
export function parseCard(input: string): Card {
  if (!input) throw new Error("parseCard: empty");
  let s = input.trim();
  // Allow "10x" alias for "Tx".
  if (s.length === 3 && s.slice(0, 2) === "10") s = `T${s[2]}`;
  if (s.length !== 2) throw new Error(`parseCard: bad length "${input}"`);
  const r = s[0].toUpperCase() as Rank;
  const u = s[1].toLowerCase() as Suit;
  if (!RANKS.includes(r)) throw new Error(`parseCard: bad rank "${input}"`);
  if (!SUITS.includes(u)) throw new Error(`parseCard: bad suit "${input}"`);
  return `${r}${u}` as Card;
}

export function isValidCard(s: string): boolean {
  try {
    parseCard(s);
    return true;
  } catch {
    return false;
  }
}

/** Sort high → low by rank. Stable enough for display use. */
export function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => rankValue(rankOf(b)) - rankValue(rankOf(a)));
}

/** Two-card hand → canonical "AKs" / "AKo" / "QQ" form for chart lookup. */
export function holeToCode(cards: Card[]): string {
  if (cards.length !== 2) throw new Error("holeToCode: need exactly 2 cards");
  const [a, b] = sortByRankDesc(cards);
  const ra = rankOf(a);
  const rb = rankOf(b);
  if (ra === rb) return `${ra}${rb}`; // pocket pair
  const suited = suitOf(a) === suitOf(b);
  return `${ra}${rb}${suited ? "s" : "o"}`;
}

/** All 52 cards in canonical order. */
export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const u of SUITS) out.push(`${r}${u}` as Card);
  return out;
}

/** Build a deck minus the given known cards. Useful for equity sims. */
export function deckMinus(known: Card[]): Card[] {
  const dead = new Set(known);
  return fullDeck().filter((c) => !dead.has(c));
}

/** Pretty single-line print, "As Kd 9h". */
export function handToString(cards: Card[]): string {
  return cards.join(" ");
}
