// Current-session state: id, start time, hands seen, opponents, tilt, recommendation.
// Stats are computed (not persisted directly).
import { create } from "zustand";
import type {
  GameState,
  OpponentProfile,
  Recommendation,
  SessionStats,
  TiltState,
} from "@/types/game";

interface PerHandSummary {
  followed: boolean;
  netChips: number;
  potFinal: number;
}

interface SessionState {
  id: string | null;
  startedAt: number | null;
  endedAt: number | null;
  isActive: boolean;

  /** Latest game state seen by the pipeline. */
  lastGameState: GameState | null;
  /** Currently displayed recommendation (kept across frames until invalidated). */
  recommendation: Recommendation | null;

  hands: PerHandSummary[];
  opponents: Record<number, OpponentProfile>;
  tilt: TiltState;

  startSession: (id: string) => void;
  endSession: () => void;
  setGameState: (gs: GameState | null) => void;
  setRecommendation: (r: Recommendation | null) => void;
  pushHand: (h: PerHandSummary) => void;
  setOpponent: (p: OpponentProfile) => void;
  setTilt: (t: TiltState) => void;
  reset: () => void;
}

const initialTilt: TiltState = { flags: [], level: 0 };

export const useSessionStore = create<SessionState>((set) => ({
  id: null,
  startedAt: null,
  endedAt: null,
  isActive: false,
  lastGameState: null,
  recommendation: null,
  hands: [],
  opponents: {},
  tilt: initialTilt,

  startSession: (id) =>
    set({
      id,
      startedAt: Date.now(),
      endedAt: null,
      isActive: true,
      hands: [],
      opponents: {},
      tilt: initialTilt,
      lastGameState: null,
      recommendation: null,
    }),
  endSession: () => set({ isActive: false, endedAt: Date.now() }),
  setGameState: (gs) => set({ lastGameState: gs }),
  setRecommendation: (r) => set({ recommendation: r }),
  pushHand: (h) => set((s) => ({ hands: [...s.hands, h] })),
  setOpponent: (p) =>
    set((s) => ({ opponents: { ...s.opponents, [p.seatNum]: p } })),
  setTilt: (t) => set({ tilt: t }),
  reset: () =>
    set({
      id: null,
      startedAt: null,
      endedAt: null,
      isActive: false,
      lastGameState: null,
      recommendation: null,
      hands: [],
      opponents: {},
      tilt: initialTilt,
    }),
}));

/** Derive session stats from the in-memory hand summaries. */
export function selectStats(hands: PerHandSummary[]): SessionStats {
  let netChips = 0;
  let followedRecHands = 0;
  let followedRecNet = 0;
  let unfollowedRecHands = 0;
  let unfollowedRecNet = 0;
  let biggestPotWon = 0;
  let biggestPotLost = 0;
  for (const h of hands) {
    netChips += h.netChips;
    if (h.followed) {
      followedRecHands += 1;
      followedRecNet += h.netChips;
    } else {
      unfollowedRecHands += 1;
      unfollowedRecNet += h.netChips;
    }
    if (h.netChips > biggestPotWon) biggestPotWon = h.netChips;
    if (h.netChips < biggestPotLost) biggestPotLost = h.netChips;
  }
  // BB/100 needs a BB anchor; we use 1 as a placeholder until a hand provides it.
  const bbPer100 = hands.length > 0 ? (netChips / hands.length) * 100 : 0;
  return {
    hands: hands.length,
    netChips,
    bbPer100,
    followedRecHands,
    followedRecNet,
    unfollowedRecHands,
    unfollowedRecNet,
    biggestPotWon,
    biggestPotLost,
  };
}
