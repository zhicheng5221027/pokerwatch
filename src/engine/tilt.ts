// Tilt detector. Strategy doc §5.
// Pure: caller passes a snapshot of the rolling window. We never touch storage.

import type { TiltState } from "@/types/game";

export interface TiltInput {
  /** Hero VPIP over last 30-hand window (0..100). */
  vpipWindow: number;
  /** Decision time samples in milliseconds for the same window. */
  decisionTimesMs: number[];
  /** Number of times in the window hero deviated from the chart. */
  deviationsFromChart: number;
  /** Recent net result expressed in buy-ins (negative = down). */
  recentNetBuyIns: number;
  /** Hero's long-term VPIP baseline (0..100). Optional; default 22. */
  baselineVpip?: number;
}

const FLAG_VPIP_SPIKE = "vpip-spike";
const FLAG_AUTO_PILOT = "auto-pilot";
const FLAG_DEVIATION = "chart-deviation";
const FLAG_LOSS_SPIRAL = "loss-spiral";
const FLAG_HOT_RUN = "hot-run-careful";

export function detectTilt(input: TiltInput): TiltState {
  const flags: string[] = [];
  const baseline = input.baselineVpip ?? 22;

  // VPIP spike: window VPIP is more than 50% above baseline.
  if (input.vpipWindow > baseline * 1.5) flags.push(FLAG_VPIP_SPIKE);

  // Auto-pilot: avg decision time below 2s.
  if (input.decisionTimesMs.length >= 5) {
    const avg =
      input.decisionTimesMs.reduce((a, b) => a + b, 0) /
      input.decisionTimesMs.length;
    if (avg < 2000) flags.push(FLAG_AUTO_PILOT);
  }

  // Chart deviation: 3+ in window.
  if (input.deviationsFromChart >= 3) flags.push(FLAG_DEVIATION);

  // Loss spiral: down ≥ 2 buy-ins in window.
  if (input.recentNetBuyIns <= -2) flags.push(FLAG_LOSS_SPIRAL);

  // Hot-run flag: up >2 buy-ins (overconfidence risk).
  if (input.recentNetBuyIns >= 2) flags.push(FLAG_HOT_RUN);

  let level: TiltState["level"] = 0;
  if (flags.length === 1) level = 1;
  else if (flags.length === 2) level = 2;
  else if (flags.length >= 3) level = 3;

  // Loss spiral always ≥ level 2.
  if (flags.includes(FLAG_LOSS_SPIRAL) && level < 2) level = 2;

  return { flags, level };
}
