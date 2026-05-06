// Pot odds, MDF, and implied odds. Pure math, no state.

/**
 * Pot odds as a percentage 0..100: the equity threshold a call needs to break even.
 * Formula: toCall / (potBeforeCall + bet + toCall).
 *
 * `pot` here is the *current* pot size after villain's bet has been added,
 * and `toCall` is what hero must put in. So pot odds = toCall / (pot + toCall).
 *
 * If toCall <= 0 returns 0 (free check-in).
 */
export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  const denom = pot + toCall;
  if (denom <= 0) return 0;
  return (toCall / denom) * 100;
}

/**
 * Minimum Defense Frequency as a percentage 0..100.
 * MDF = pot / (pot + bet). Pot here is the pot BEFORE the villain's bet.
 * If hero calls fewer than MDF of the time, villain's bluff prints money.
 */
export function mdf(pot: number, bet: number): number {
  if (bet <= 0) return 100;
  const denom = pot + bet;
  if (denom <= 0) return 0;
  return (pot / denom) * 100;
}

/**
 * Approximate the chips you must extract on later streets to make a current
 * draw call profitable. Returns the EV-neutral target additional winnings.
 *
 * equity is 0..1. If equity already covers pot odds the function returns 0.
 *
 * impliedTarget = (toCall * (1 - equity) - (pot * equity)) / equity
 * (i.e. what you need to win on later streets when you hit, on top of the pot.)
 */
export function impliedOddsTarget(
  toCall: number,
  pot: number,
  equity: number,
): number {
  if (equity <= 0) return Infinity;
  if (equity >= 1) return 0;
  const oddsPct = potOdds(toCall, pot) / 100;
  if (equity >= oddsPct) return 0;
  return (toCall * (1 - equity) - pot * equity) / equity;
}

/**
 * Cap implied odds by what villain can actually pay. Returns true if a
 * draw is worth chasing given remaining stack behind.
 */
export function impliedOddsViable(
  toCall: number,
  pot: number,
  equity: number,
  stackBehind: number,
): boolean {
  const need = impliedOddsTarget(toCall, pot, equity);
  if (!isFinite(need)) return false;
  if (need <= 0) return true;
  return stackBehind >= need;
}
