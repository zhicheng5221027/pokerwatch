import { describe, expect, it } from "vitest";
import { potOdds, mdf, impliedOddsTarget, impliedOddsViable } from "../odds";

describe("potOdds", () => {
  it("returns 0 when toCall <= 0", () => {
    expect(potOdds(0, 100)).toBe(0);
    expect(potOdds(-5, 100)).toBe(0);
  });

  it("matches by-hand calc: 100 to call into pot 200 ⇒ 33.33%", () => {
    // 100 / (200 + 100) = 0.3333...
    const o = potOdds(100, 200);
    expect(o).toBeCloseTo(33.333, 2);
  });

  it("matches by-hand calc: 50 to call into pot 150 ⇒ 25%", () => {
    expect(potOdds(50, 150)).toBeCloseTo(25, 5);
  });
});

describe("mdf", () => {
  it("returns 100 when bet = 0", () => {
    expect(mdf(100, 0)).toBe(100);
  });

  it("matches by-hand calc: pot 100, bet 100 ⇒ 50% MDF", () => {
    expect(mdf(100, 100)).toBe(50);
  });

  it("matches by-hand calc: pot 100, bet 50 ⇒ 66.67% MDF", () => {
    expect(mdf(100, 50)).toBeCloseTo(66.667, 2);
  });
});

describe("impliedOddsTarget", () => {
  it("returns 0 if equity already covers pot odds", () => {
    // pot odds = 33.3%; equity 50% covers
    expect(impliedOddsTarget(100, 200, 0.5)).toBe(0);
  });

  it("returns Infinity if equity is 0", () => {
    expect(impliedOddsTarget(100, 200, 0)).toBe(Infinity);
  });

  it("computes additional chips needed when equity < pot odds", () => {
    // pot 100, toCall 50, equity 0.18 (small underdog).
    // need = (50 * 0.82 - 100 * 0.18) / 0.18 = (41 - 18) / 0.18 = 127.78
    const target = impliedOddsTarget(50, 100, 0.18);
    expect(target).toBeCloseTo(127.78, 1);
  });
});

describe("impliedOddsViable", () => {
  it("true when stack behind covers implied target", () => {
    expect(impliedOddsViable(50, 100, 0.18, 200)).toBe(true);
  });
  it("false when stack behind does not cover implied target", () => {
    expect(impliedOddsViable(50, 100, 0.18, 50)).toBe(false);
  });
  it("true when equity already meets pot odds", () => {
    expect(impliedOddsViable(50, 100, 0.5, 0)).toBe(true);
  });
});
