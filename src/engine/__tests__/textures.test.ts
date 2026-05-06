import { describe, expect, it } from "vitest";
import { classifyBoard } from "../postflop/textures";

describe("classifyBoard", () => {
  it("Ks 9s 4s ⇒ monotone", () => {
    const t = classifyBoard(["Ks", "9s", "4s"]);
    expect(t.monotone).toBe(true);
    expect(t.twoTone).toBe(false);
    expect(t.label).toBe("monotone");
    expect(t.hasFlushDraw).toBe(true);
  });

  it("9h 8h 6c ⇒ two-tone + connected", () => {
    const t = classifyBoard(["9h", "8h", "6c"]);
    expect(t.twoTone).toBe(true);
    expect(t.monotone).toBe(false);
    expect(t.connectedness).toBeGreaterThan(0.5);
    expect(t.label).toBe("two-tone-connected");
    expect(t.hasOpenEnder).toBe(true);
  });

  it("Qs Jh Td ⇒ broadway dynamic", () => {
    const t = classifyBoard(["Qs", "Jh", "Td"]);
    expect(t.monotone).toBe(false);
    expect(t.connectedness).toBeGreaterThan(0.6);
    expect(t.hasOpenEnder).toBe(true);
    expect(t.label).toBe("broadway-dynamic");
  });

  it("As 7h 2c ⇒ dry ace-high", () => {
    const t = classifyBoard(["As", "7h", "2c"]);
    expect(t.isAceHigh).toBe(true);
    expect(t.connectedness).toBeLessThan(0.4);
    expect(t.label).toBe("dry-ace-high");
  });

  it("Ks Kd 4c ⇒ paired", () => {
    const t = classifyBoard(["Ks", "Kd", "4c"]);
    expect(t.paired).toBe(true);
    expect(t.label).toBe("paired");
  });

  it("empty board ⇒ unknown", () => {
    const t = classifyBoard([]);
    expect(t.label).toBe("unknown");
    expect(t.highCard).toBeNull();
  });
});
