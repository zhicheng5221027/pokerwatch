import { describe, expect, it } from "vitest";
import { spr, sprBucket, commitFlag } from "../spr";

describe("spr", () => {
  it("computes effective stack ÷ pot", () => {
    expect(spr({ myStack: 200, pot: 100 })).toBe(2);
    expect(spr({ myStack: 50, pot: 100 })).toBe(0.5);
  });

  it("returns Infinity on empty pot", () => {
    expect(spr({ myStack: 100, pot: 0 })).toBe(Infinity);
  });
});

describe("sprBucket", () => {
  it("low for ≤ 4", () => {
    expect(sprBucket(1)).toBe("low");
    expect(sprBucket(4)).toBe("low");
  });
  it("mid for 4..13", () => {
    expect(sprBucket(5)).toBe("mid");
    expect(sprBucket(13)).toBe("mid");
  });
  it("high for >13", () => {
    expect(sprBucket(20)).toBe("high");
  });
});

describe("commitFlag", () => {
  it("low SPR + TPGK ⇒ committed", () => {
    expect(commitFlag(2.5, "tpgk")).toBe(true);
  });

  it("low SPR + strong ⇒ committed", () => {
    expect(commitFlag(3, "strong")).toBe(true);
  });

  it("monster always committed regardless of SPR", () => {
    expect(commitFlag(50, "monster")).toBe(true);
  });

  it("mid SPR + TPGK ⇒ NOT committed (pot-control)", () => {
    expect(commitFlag(8, "tpgk")).toBe(false);
  });

  it("high SPR + strong ⇒ NOT committed", () => {
    expect(commitFlag(20, "strong")).toBe(false);
  });

  it("draw never committed by spr alone", () => {
    expect(commitFlag(2, "draw")).toBe(false);
  });

  it("air never committed", () => {
    expect(commitFlag(1, "air")).toBe(false);
  });
});
