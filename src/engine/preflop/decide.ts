// Local-only preflop decision. Returns null if the spot is too complex for
// chart-only logic (multi-way 3bet pots, weird sizings, etc.) and we should
// escalate to the AI. Otherwise returns a Recommendation tagged
// source: "preflop-chart".

import type {
  GameState,
  OpponentProfile,
  Position,
  Recommendation,
  ActionEvent,
} from "@/types/game";
import { holeToCode } from "../cards";
import { isInRfi, vsRaise, vs3Bet, bbDefendVsLatePos } from "./ranges";
import { isPushFoldStack, shouldShove } from "./pushFold";

export type RiskProfile = "tight" | "standard" | "loose";

/**
 * Position must be supplied externally (vision/UI assigns based on dealer button).
 * We accept it as part of GameState extension via a sidecar argument because
 * GameState in types/game.ts doesn't store hero position directly.
 */
export interface PreflopContext {
  heroPosition: Position;
}

interface PreflopAggression {
  raises: number;        // count of raises (incl. RFI)
  callers: number;       // limpers / cold-callers
  lastRaiseAmount: number;
  lastRaiserSeat: number | null;
}

/** Walk preflop action history to summarize aggression. */
function summarizePreflop(history: ActionEvent[]): PreflopAggression {
  let raises = 0;
  let callers = 0;
  let lastRaiseAmount = 0;
  let lastRaiserSeat: number | null = null;
  for (const a of history) {
    if (a.street !== "preflop") continue;
    if (a.verb === "raise" || a.verb === "all-in" || a.verb === "bet") {
      raises += 1;
      lastRaiseAmount = a.amount ?? lastRaiseAmount;
      lastRaiserSeat = a.seatNum;
    } else if (a.verb === "call") {
      callers += 1;
    }
  }
  return { raises, callers, lastRaiseAmount, lastRaiserSeat };
}

/** Risk-profile bias on borderline action — lightweight, no chart edits. */
function applyRisk(
  base: Recommendation,
  risk: RiskProfile,
): Recommendation {
  if (risk === "tight" && base.action === "raise" && base.confidence < 70) {
    return { ...base, action: "fold", reasoning: `${base.reasoning} (risk:tight downgraded to fold)`, confidence: Math.max(50, base.confidence - 10) };
  }
  if (risk === "loose" && base.action === "fold" && base.confidence < 65) {
    return { ...base, action: "call", reasoning: `${base.reasoning} (risk:loose upgraded to call)`, confidence: Math.max(50, base.confidence - 10) };
  }
  return base;
}

const make = (
  action: Recommendation["action"],
  reasoning: string,
  confidence: number,
  extras: Partial<Recommendation> = {},
): Recommendation => ({
  action,
  reasoning,
  confidence,
  source: "preflop-chart",
  ...extras,
});

/**
 * decidePreflop:
 *   - returns Recommendation if it's a clean chart spot we can answer locally
 *   - returns null if AI strategy should be invoked
 */
export function decidePreflop(
  gs: GameState,
  ctx: PreflopContext,
  _profile?: OpponentProfile,
  riskProfile: RiskProfile = "standard",
): Recommendation | null {
  if (gs.street !== "preflop") return null;
  if (!gs.myTurn) return make("wait", "Not hero's turn yet.", 100);
  if (gs.myHole.length !== 2) return null;

  const code = holeToCode(gs.myHole);
  const pos = ctx.heroPosition;
  const bb = gs.blinds.bb;
  if (bb <= 0) return null;
  const stackBb = gs.myStack / bb;
  const summary = summarizePreflop(gs.actionHistory);
  // Number of raises in front of hero (BB post does NOT count).
  //   0 → RFI (raise first in)
  //   1 → facing a single open
  //   2 → facing a 3-bet
  //   3+ → 4-bet+ pot, too complex for chart-only ⇒ defer to AI
  const opensInFront = summary.raises;

  // Short stack: push-fold preflop.
  if (isPushFoldStack(stackBb)) {
    if (opensInFront === 0) {
      // Open-shove or fold.
      const jam = shouldShove(pos, code, stackBb);
      if (jam) {
        return applyRisk(
          make(
            "all-in",
            `Push-fold: ${code} jam from ${pos} at ${stackBb.toFixed(1)}bb.`,
            85,
            { sizing: gs.myStack },
          ),
          riskProfile,
        );
      }
      return applyRisk(
        make("fold", `Push-fold: ${code} fold from ${pos} at ${stackBb.toFixed(1)}bb.`, 85),
        riskProfile,
      );
    }
    // Facing a raise short-stacked → call/jam decision is too AI-shaped; defer.
    return null;
  }

  // 100bb-ish baseline territory.

  // 1) Raise first in.
  if (opensInFront === 0 && summary.callers === 0) {
    const inRange = isInRfi(pos, code);
    if (pos === "BB") {
      // BB never opens — just check if no raise.
      if (gs.toCall <= 0) {
        return make("check", "BB option, no raise — check.", 95);
      }
    }
    if (inRange) {
      const open = bb * 2.5;
      return applyRisk(
        make("raise", `RFI: ${code} opens from ${pos} (chart).`, 88, {
          sizing: Math.round(open),
        }),
        riskProfile,
      );
    }
    return applyRisk(
      make("fold", `Out of RFI range: ${code} from ${pos}.`, 85),
      riskProfile,
    );
  }

  // 2) Limpers in front, no raise. Iso-raise common opens; otherwise fold/check BB option.
  if (opensInFront === 0 && summary.callers > 0) {
    if (pos === "BB" && gs.toCall <= 0) {
      return make("check", "BB option vs limpers — check.", 90);
    }
    // Treat BTN/CO/SB iso decisions as RFI-set membership-driven.
    const inRange = isInRfi(pos, code);
    if (inRange) {
      const iso = bb * (3 + summary.callers); // standard iso sizing
      return applyRisk(
        make("raise", `Iso-raise vs ${summary.callers} limper(s) with ${code}.`, 78, {
          sizing: Math.round(iso),
        }),
        riskProfile,
      );
    }
    return applyRisk(
      make("fold", `Out of range to iso vs limpers with ${code}.`, 75),
      riskProfile,
    );
  }

  // 3) Single open-raise in front (one raise above BB).
  if (opensInFront === 1) {
    // BB defend: very wide vs late-position open, narrower vs EP.
    if (pos === "BB") {
      const defendSet = bbDefendVsLatePos();
      if (defendSet.has(code)) {
        const decision = vsRaise(code, false /* OOP */);
        if (decision.kind === "raise") {
          const sz = Math.max(gs.toCall * 3, summary.lastRaiseAmount * 3);
          return applyRisk(
            make("raise", `3-bet ${code} from BB.`, 75, { sizing: Math.round(sz) }),
            riskProfile,
          );
        }
        return applyRisk(make("call", `Defend BB with ${code}.`, 70), riskProfile);
      }
      return applyRisk(make("fold", `BB fold ${code} vs raise.`, 80), riskProfile);
    }

    // Non-BB hero facing one raise.
    const inPos = inPositionVsRaiser(pos, summary.lastRaiserSeat, gs);
    const decision = vsRaise(code, inPos);
    if (decision.kind === "raise") {
      const sz = Math.max(summary.lastRaiseAmount * 3, gs.toCall * 3);
      return applyRisk(
        make("raise", `3-bet ${code} from ${pos}.`, 78, { sizing: Math.round(sz) }),
        riskProfile,
      );
    }
    if (decision.kind === "call") {
      return applyRisk(make("call", `Cold call ${code} from ${pos} ${inPos ? "IP" : "OOP"}.`, 65), riskProfile);
    }
    return applyRisk(make("fold", `Fold ${code} vs raise.`, 82), riskProfile);
  }

  // 4) Facing a 3-bet (two raises in front of hero post-BB).
  if (opensInFront === 2) {
    const inPos = inPositionVsRaiser(pos, summary.lastRaiserSeat, gs);
    const decision = vs3Bet(code, inPos);
    if (decision.kind === "raise") {
      const sz = Math.max(summary.lastRaiseAmount * 2.4, gs.toCall * 2.4);
      return applyRisk(
        make("raise", `4-bet ${code} from ${pos}.`, 78, { sizing: Math.round(sz) }),
        riskProfile,
      );
    }
    if (decision.kind === "call") {
      return applyRisk(make("call", `Call 3-bet with ${code} ${inPos ? "IP" : "OOP"}.`, 62), riskProfile);
    }
    if (decision.kind === "mix") return null; // defer mixed strategy to AI
    return applyRisk(make("fold", `Fold ${code} vs 3-bet.`, 80), riskProfile);
  }

  // 4-bet+ pots and multi-way reraised pots: too complex for chart-only.
  return null;
}

/**
 * Crude IP test: lower seat order vs raiser around the button → IP.
 * Without seat-order metadata we approximate by static position rank.
 */
function inPositionVsRaiser(
  hero: Position,
  raiserSeat: number | null,
  _gs: GameState,
): boolean {
  // Static ordering on a 9-max table going clockwise from UTG.
  const order: Position[] = ["UTG", "UTG1", "MP", "MP1", "HJ", "CO", "BTN", "SB", "BB"];
  const heroIdx = order.indexOf(hero);
  // We don't have raiser position in GameState; conservative default:
  // hero is IP if hero is BTN/CO/HJ regardless. Otherwise OOP.
  if (raiserSeat === null) return heroIdx >= 5; // CO+
  return heroIdx >= 5;
}
