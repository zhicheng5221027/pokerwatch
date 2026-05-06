// Bankroll level recommender and stop-loss watcher.
// Strategy doc §1: 30 buy-ins min for full ring NLHE cash, stop-loss at -3 buy-ins.

import type { BankrollStatus } from "@/types/game";

const MIN_BUYINS_GREEN = 30;
const MIN_BUYINS_YELLOW = 15;
const STOP_LOSS_BUYINS = 3;

/**
 * Compute current bankroll status against a chosen buy-in size.
 * Default buy-in is 100bb of the table's BB.
 *
 * Levels:
 *   green  — ≥ 30 buy-ins
 *   yellow — 15..29 buy-ins
 *   red    — < 15 buy-ins (sit at lower stake)
 */
export function status(
  bankrollChips: number,
  bbAtTable: number,
  buyInChips?: number,
): BankrollStatus {
  const buyIn = buyInChips && buyInChips > 0 ? buyInChips : bbAtTable * 100;
  const buyInsHeld = buyIn > 0 ? bankrollChips / buyIn : 0;
  let level: BankrollStatus["level"];
  if (buyInsHeld >= MIN_BUYINS_GREEN) level = "green";
  else if (buyInsHeld >= MIN_BUYINS_YELLOW) level = "yellow";
  else level = "red";
  return {
    bankrollChips,
    buyInChips: buyIn,
    buyInsHeld,
    level,
  };
}

/**
 * Returns true once the user has lost the equivalent of 3 buy-ins this session.
 * `sessionNetChips` is signed (negative = loss).
 */
export function stopLossHit(
  sessionNetChips: number,
  buyInChips: number,
): boolean {
  if (buyInChips <= 0) return false;
  const lossInBuyIns = -sessionNetChips / buyInChips;
  return lossInBuyIns >= STOP_LOSS_BUYINS;
}

/** Bool helper used by the UI banner: red bankroll for the table. */
export function isRedAtTable(bankroll: BankrollStatus): boolean {
  return bankroll.level === "red";
}
