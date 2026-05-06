// SPR (stack-to-pot ratio) and commitment threshold logic.
// Pure functions; no game state mutation.

export type SprBucket = "low" | "mid" | "high";

export interface SprInput {
  myStack: number;
  pot: number;
}

/** SPR = effective stack ÷ current pot. Returns Infinity if pot is 0. */
export function spr({ myStack, pot }: SprInput): number {
  if (pot <= 0) return Infinity;
  if (myStack <= 0) return 0;
  return myStack / pot;
}

/** Bucketed SPR for prompt-friendly bucketing. */
export function sprBucket(value: number): SprBucket {
  if (value <= 4) return "low";
  if (value <= 13) return "mid";
  return "high";
}

/**
 * Hand-strength tiers we use to decide commitment without an equity sim.
 * - "monster": top set / straight / flush / better
 * - "strong": overpair, two pair, top pair top kicker (TPTK)
 * - "tpgk": top pair good kicker
 * - "marginal": middle pair / weak top pair / dominated draws
 * - "draw": 8-out+ draws (FD or OESD or combo)
 * - "air": no pair, no draw
 */
export type HandStrength =
  | "monster"
  | "strong"
  | "tpgk"
  | "marginal"
  | "draw"
  | "air";

/**
 * Returns true if the spot is a commit (hero should not fold to non-trivial pressure).
 * Rules:
 *   - monster ⇒ always committed
 *   - low SPR (≤4) + (strong | tpgk) ⇒ committed
 *   - mid SPR + strong ⇒ committed
 *   - everything else ⇒ not committed
 */
export function commitFlag(sprValue: number, strength: HandStrength): boolean {
  if (strength === "monster") return true;
  const bucket = sprBucket(sprValue);
  if (bucket === "low" && (strength === "strong" || strength === "tpgk")) {
    return true;
  }
  if (bucket === "mid" && strength === "strong") return true;
  return false;
}
