// Postflop "hint" generator. We do NOT pick the action locally postflop —
// that's the AI strategy's job. We just compute the structured math the AI
// will be told to use, plus a suggested bet size.

import type { GameState, Street } from "@/types/game";
import { classifyBoard, type BoardTexture } from "./textures";
import { pickFraction, pickSizing, type SizingRole } from "./sizing";
import { spr, sprBucket, type SprBucket } from "../spr";

export interface PostflopHints {
  texture: BoardTexture;
  sprValue: number;
  sprBucket: SprBucket;
  /** The pot fraction we suggest for a value bet on this texture. */
  valueSizingFraction: number;
  /** The pot fraction we suggest for a bluff bet on this texture. */
  bluffSizingFraction: number;
  /** Suggested chip amount for the *standard* role (value if hero is committed, else mixed). */
  sizingHintChips: number;
  /** Where hero's range strength tends to sit on this board. */
  valueRangeStrength: "favored" | "neutral" | "disfavored";
  street: Street;
}

/**
 * Decide the structured hints the AI prompt will consume.
 * Pure: no equity sim here — that's the worker's job.
 */
export function decidePostflopHints(gs: GameState): PostflopHints {
  const texture = classifyBoard(gs.board);
  const s = spr({ myStack: gs.myStack, pot: gs.pot });
  const bucket = sprBucket(s);
  const valueSizingFraction = pickFraction(texture, "value", gs.street);
  const bluffSizingFraction = pickFraction(texture, "bluff", gs.street);
  // Default sizing role is "mixed" unless low SPR and ace-high dry → "value".
  const role: SizingRole =
    bucket === "low" ? "value" : "mixed";
  const sizingHintChips = pickSizing({
    texture,
    role,
    street: gs.street,
    potChips: gs.pot,
  });
  const valueRangeStrength = inferRangeStrength(texture);
  return {
    texture,
    sprValue: s,
    sprBucket: bucket,
    valueSizingFraction,
    bluffSizingFraction,
    sizingHintChips,
    valueRangeStrength,
    street: gs.street,
  };
}

/**
 * Heuristic: hero has range advantage on dry ace-high & dry-low boards (PFR
 * range). Hero is at parity on two-tone connected. Hero is disfavored on
 * connected mid-card boards / paired low boards (BB caller hits these
 * harder than EP open).
 */
function inferRangeStrength(t: BoardTexture): PostflopHints["valueRangeStrength"] {
  switch (t.label) {
    case "dry-ace-high":
    case "broadway-dynamic":
      return "favored";
    case "dry-low":
    case "paired":
    case "two-tone-connected":
      return "neutral";
    case "monotone":
    case "wet":
      return "disfavored";
    default:
      return "neutral";
  }
}
