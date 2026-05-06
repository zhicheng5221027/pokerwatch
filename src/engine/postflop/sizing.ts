// Sizing tier picker per strategy doc §3.2.
// Returns a chip amount given pot in big blinds and a chosen role.

import type { Street } from "@/types/game";
import type { BoardTexture } from "./textures";

export type SizingRole = "value" | "bluff" | "mixed";

export interface SizingInput {
  texture: BoardTexture;
  role: SizingRole;
  street: Street;
  /** Pot in chips. The function returns a chip-denominated bet. */
  potChips: number;
}

/**
 * Map (texture, role, street) to a fraction of pot, then return chips.
 *   Small  ≈ 0.30  — dry, range-bet, blocker bets
 *   Medium ≈ 0.55  — standard
 *   Large  ≈ 0.80  — polarized wet, big rivers
 *
 * Returned chips are rounded to nearest whole chip.
 */
export function pickSizing({
  texture,
  role,
  street,
  potChips,
}: SizingInput): number {
  if (potChips <= 0) return 0;
  const frac = pickFraction(texture, role, street);
  return Math.max(1, Math.round(potChips * frac));
}

/** Returns the % of pot to bet (0..1). Public for the prompt builder. */
export function pickFraction(
  texture: BoardTexture,
  role: SizingRole,
  street: Street,
): number {
  // Defaults
  let frac = 0.55;

  if (street === "river") {
    // Rivers tend to be polar.
    if (role === "value") frac = 0.75;
    if (role === "bluff") frac = 0.75;
    if (role === "mixed") frac = 0.55;
  }

  // Texture overrides
  switch (texture.label) {
    case "dry-ace-high":
    case "dry-low":
    case "paired":
      frac = role === "value" ? 0.33 : role === "bluff" ? 0.33 : 0.30;
      break;
    case "monotone":
      // Cautious. Bigger when we have it; rarely bluff-bet.
      frac = role === "value" ? 0.75 : role === "bluff" ? 0.50 : 0.40;
      break;
    case "two-tone-connected":
    case "broadway-dynamic":
    case "wet":
      frac = role === "value" ? 0.75 : role === "bluff" ? 0.66 : 0.66;
      break;
    case "unknown":
      frac = 0.55;
      break;
  }

  // On flops, lean smaller; on turns/rivers lean bigger.
  if (street === "flop") frac *= 0.95;
  if (street === "turn") frac *= 1.05;
  if (street === "river") frac *= 1.0;

  // Clamp
  return Math.max(0.2, Math.min(1.25, frac));
}
