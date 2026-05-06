// Platform registry. Maps a string id to its layout module.
//
// Add new platforms by:
//   1. Creating `./<name>.ts` exporting `getLayout(canvas): Layout`.
//   2. Importing it here and adding to PLATFORMS.

import * as stakeUs from "./stakeUs";
import * as generic from "./generic";
import type { Layout } from "./stakeUs";

export type PlatformId = "stake.us" | "generic";

export interface PlatformModule {
  getLayout: (canvas: HTMLCanvasElement | OffscreenCanvas) => Layout;
}

export const PLATFORMS: Record<PlatformId, PlatformModule> = {
  "stake.us": { getLayout: stakeUs.getLayout },
  generic: { getLayout: generic.getLayout },
};

/** Resolve a layout for a platform id, falling back to generic for unknowns. */
export function getPlatform(id: string): PlatformModule {
  return PLATFORMS[id as PlatformId] ?? PLATFORMS.generic;
}

export type { Layout, RelBox, SeatROI } from "./stakeUs";
