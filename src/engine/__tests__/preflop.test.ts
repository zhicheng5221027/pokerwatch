import { describe, expect, it } from "vitest";
import type { Card, GameState } from "@/types/game";
import { rfiRange, isInRfi } from "../preflop/ranges";
import { decidePreflop } from "../preflop/decide";

/* ---------------------------- range size sanity ---------------------------- */
//
// Strategy doc §2 quotes "% of hands" loosely; the meaningful test is that
// UTG is a narrow range and BTN is much wider. We sanity-check both:
//  (a) representative hands are in/out of the range
//  (b) BTN is at least ~3.5x wider than UTG by code-count
//  (c) UTG sits roughly in the 6–13% combo band, BTN in the 25–55% band.

const COMBOS_TOTAL = 1326;

function combosInRange(codes: Set<string>): number {
  let n = 0;
  for (const code of codes) {
    if (code.length === 2 && code[0] === code[1]) n += 6; // pair
    else if (code.endsWith("s")) n += 4;
    else if (code.endsWith("o")) n += 12;
  }
  return n;
}

describe("preflop RFI ranges", () => {
  const utg = rfiRange("UTG");
  const btn = rfiRange("BTN");

  it("UTG opens premium hands and folds trash", () => {
    expect(isInRfi("UTG", "AA")).toBe(true);
    expect(isInRfi("UTG", "KK")).toBe(true);
    expect(isInRfi("UTG", "QQ")).toBe(true);
    expect(isInRfi("UTG", "AKs")).toBe(true);
    expect(isInRfi("UTG", "AKo")).toBe(true);
    expect(isInRfi("UTG", "AQo")).toBe(true);
    expect(isInRfi("UTG", "KQs")).toBe(true);
    // Not in UTG:
    expect(isInRfi("UTG", "T9s")).toBe(false);
    expect(isInRfi("UTG", "76s")).toBe(false);
    expect(isInRfi("UTG", "Q5s")).toBe(false);
    expect(isInRfi("UTG", "J7o")).toBe(false);
    expect(isInRfi("UTG", "72o")).toBe(false);
    expect(isInRfi("UTG", "55")).toBe(false);
  });

  it("BTN opens a wide range", () => {
    expect(isInRfi("BTN", "22")).toBe(true);
    expect(isInRfi("BTN", "A2s")).toBe(true);
    expect(isInRfi("BTN", "65s")).toBe(true);
    expect(isInRfi("BTN", "54s")).toBe(true);
    expect(isInRfi("BTN", "T9o")).toBe(true);
    expect(isInRfi("BTN", "K9o")).toBe(true);
    expect(isInRfi("BTN", "AKo")).toBe(true);
    // 32o still folded even from BTN:
    expect(isInRfi("BTN", "72o")).toBe(false);
    expect(isInRfi("BTN", "32o")).toBe(false);
  });

  it("BTN range is several times wider than UTG (code count)", () => {
    expect(btn.size).toBeGreaterThan(utg.size * 3);
  });

  it("UTG range falls in narrow band (~6-13% of combos)", () => {
    const pct = (combosInRange(utg) / COMBOS_TOTAL) * 100;
    expect(pct).toBeGreaterThanOrEqual(5);
    expect(pct).toBeLessThanOrEqual(13);
  });

  it("BTN range falls in wide band (~25-55% of combos)", () => {
    const pct = (combosInRange(btn) / COMBOS_TOTAL) * 100;
    expect(pct).toBeGreaterThanOrEqual(25);
    expect(pct).toBeLessThanOrEqual(55);
  });
});

/* --------------------------- decidePreflop tests --------------------------- */

function baseState(hole: [Card, Card], overrides: Partial<GameState> = {}): GameState {
  return {
    platform: "stake.us",
    tableId: null,
    blinds: { sb: 1, bb: 2 },
    ante: 0,
    stakeCurrency: "GC",
    street: "preflop",
    pot: 3,
    toCall: 2,
    board: [],
    myHole: hole,
    mySeat: 1,
    myStack: 200,
    seats: [],
    actionOnSeat: 1,
    myTurn: true,
    actionHistory: [
      { street: "preflop", seatNum: 8, verb: "post-sb", amount: 1, timestamp: 1 },
      { street: "preflop", seatNum: 9, verb: "post-bb", amount: 2, timestamp: 2 },
    ],
    confidence: 1,
    capturedAt: Date.now(),
    ...overrides,
  };
}

describe("decidePreflop", () => {
  it("RAISES with AA from UTG (no opens in front)", () => {
    const gs = baseState(["As", "Ad"]);
    const rec = decidePreflop(gs, { heroPosition: "UTG" });
    expect(rec).not.toBeNull();
    expect(rec!.action).toBe("raise");
    expect(rec!.sizing).toBeGreaterThan(0);
    expect(rec!.source).toBe("preflop-chart");
  });

  it("FOLDS 72o from UTG", () => {
    const gs = baseState(["7c", "2d"]);
    const rec = decidePreflop(gs, { heroPosition: "UTG" });
    expect(rec).not.toBeNull();
    expect(rec!.action).toBe("fold");
  });

  it("RAISES T9s from BTN (in BTN range)", () => {
    const gs = baseState(["Ts", "9s"]);
    const rec = decidePreflop(gs, { heroPosition: "BTN" });
    expect(rec).not.toBeNull();
    expect(rec!.action).toBe("raise");
  });

  it("returns wait when not hero's turn", () => {
    const gs = baseState(["As", "Ad"], { myTurn: false });
    const rec = decidePreflop(gs, { heroPosition: "UTG" });
    expect(rec).not.toBeNull();
    expect(rec!.action).toBe("wait");
  });

  it("3-bets KK for value vs an open", () => {
    const gs = baseState(["Kc", "Kd"], {
      actionHistory: [
        { street: "preflop", seatNum: 8, verb: "post-sb", amount: 1, timestamp: 1 },
        { street: "preflop", seatNum: 9, verb: "post-bb", amount: 2, timestamp: 2 },
        { street: "preflop", seatNum: 5, verb: "raise", amount: 6, timestamp: 3 },
      ],
      toCall: 6,
    });
    const rec = decidePreflop(gs, { heroPosition: "BTN" });
    expect(rec).not.toBeNull();
    expect(rec!.action).toBe("raise");
  });

  it("returns null for 4-bet+ pots (escalates to AI)", () => {
    const gs = baseState(["Qc", "Qd"], {
      actionHistory: [
        { street: "preflop", seatNum: 8, verb: "post-sb", amount: 1, timestamp: 1 },
        { street: "preflop", seatNum: 9, verb: "post-bb", amount: 2, timestamp: 2 },
        { street: "preflop", seatNum: 5, verb: "raise", amount: 6, timestamp: 3 },
        { street: "preflop", seatNum: 7, verb: "raise", amount: 18, timestamp: 4 },
        { street: "preflop", seatNum: 5, verb: "raise", amount: 45, timestamp: 5 },
      ],
      toCall: 45,
    });
    const rec = decidePreflop(gs, { heroPosition: "BTN" });
    expect(rec).toBeNull();
  });
});
