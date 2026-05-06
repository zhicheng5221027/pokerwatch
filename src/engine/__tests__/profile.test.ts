import { describe, expect, it } from "vitest";
import type { ActionEvent } from "@/types/game";
import { buildProfile } from "../profile";

/**
 * Helpers: simulate N hands for a seat with the given preflop verb.
 * After each hand we emit a sentinel "flop check by another seat" event so
 * the profile builder sees a street transition (= hand boundary).
 *
 * If the simulated seat folded preflop, the hand-boundary heuristic also
 * picks that up via lastSeatPreflopVerb === "fold", but the sentinel works
 * uniformly for raises/calls too.
 */
const OTHER_SEAT = 99;

function simulateHands(
  seatNum: number,
  perHand: Array<{ preflop: ActionEvent["verb"]; flop?: ActionEvent["verb"] }>,
): ActionEvent[] {
  const out: ActionEvent[] = [];
  let t = 0;
  for (const h of perHand) {
    out.push({
      street: "preflop",
      seatNum,
      verb: h.preflop,
      timestamp: ++t,
    });
    if (h.flop) {
      out.push({
        street: "flop",
        seatNum,
        verb: h.flop,
        timestamp: ++t,
      });
    }
    // Hand-boundary sentinel: another seat sees a flop. This causes the
    // profile builder to treat the next preflop event as a new hand.
    out.push({
      street: "flop",
      seatNum: OTHER_SEAT,
      verb: "check",
      timestamp: ++t,
    });
  }
  return out;
}

describe("buildProfile", () => {
  it("VPIP 12 / PFR 9 ⇒ 'nit' (or TAG-leaning) at low VPIP", () => {
    // 100 hands: 9 raise (PFR+VPIP), 3 call (VPIP only), 88 fold.
    const hands: Array<{ preflop: ActionEvent["verb"] }> = [];
    for (let i = 0; i < 9; i++) hands.push({ preflop: "raise" });
    for (let i = 0; i < 3; i++) hands.push({ preflop: "call" });
    for (let i = 0; i < 88; i++) hands.push({ preflop: "fold" });
    const events = simulateHands(3, hands);
    const p = buildProfile(3, events);
    expect(p.hands).toBe(100);
    expect(p.vpip).toBeCloseTo(12, 1);
    expect(p.pfr).toBeCloseTo(9, 1);
    // VPIP < 18 ⇒ nit by classifier.
    expect(p.label).toBe("nit");
  });

  it("VPIP 50 / AF 0.5 ⇒ 'calling-station'", () => {
    // 50 calls preflop, 50 folds preflop. Postflop: 1 bet, 5 calls (AF=0.2).
    const hands: Array<{ preflop: ActionEvent["verb"]; flop?: ActionEvent["verb"] }> = [];
    for (let i = 0; i < 50; i++) hands.push({ preflop: "call", flop: "call" });
    for (let i = 0; i < 50; i++) hands.push({ preflop: "fold" });
    // Add a couple of postflop bets to land AF roughly under 1.
    const events = simulateHands(4, hands);
    // Append a few flop bets so AF is ~0.04 (still < 1)
    events.push({ street: "flop", seatNum: 4, verb: "bet", timestamp: 10000 });
    events.push({ street: "turn", seatNum: 4, verb: "bet", timestamp: 10001 });
    const p = buildProfile(4, events);
    expect(p.hands).toBe(100);
    expect(p.vpip).toBeCloseTo(50, 1);
    expect(p.af).toBeLessThan(1);
    expect(p.label).toBe("calling-station");
  });

  it("returns 'unknown' below sample threshold", () => {
    const events = simulateHands(2, [
      { preflop: "raise" },
      { preflop: "fold" },
    ]);
    const p = buildProfile(2, events);
    expect(p.hands).toBe(2);
    expect(p.label).toBe("unknown");
  });

  it("TAG profile: VPIP 22 / PFR 18", () => {
    const hands: Array<{ preflop: ActionEvent["verb"] }> = [];
    for (let i = 0; i < 18; i++) hands.push({ preflop: "raise" });
    for (let i = 0; i < 4; i++) hands.push({ preflop: "call" });
    for (let i = 0; i < 78; i++) hands.push({ preflop: "fold" });
    const events = simulateHands(7, hands);
    const p = buildProfile(7, events);
    expect(p.vpip).toBeCloseTo(22, 1);
    expect(p.pfr).toBeCloseTo(18, 1);
    expect(p.label).toBe("TAG");
  });
});
