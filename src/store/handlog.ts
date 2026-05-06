// Recent-hand buffer (last 50). Persisted so users see history across reloads.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Card, GameState, Recommendation } from "@/types/game";

export interface LoggedHand {
  id: string;
  /** Per-session hand number (1-based). */
  handNumber: number;
  startedAt: number;
  endedAt?: number;
  position?: string;
  holeCards?: Card[];
  board?: Card[];
  streetReached?: GameState["street"];
  potFinal?: number;
  myAction?: string;
  resultChips?: number;
  recommendation?: Recommendation;
  reasoning?: string;
}

interface HandLogState {
  hands: LoggedHand[];
  upsert: (h: LoggedHand) => void;
  finalize: (id: string, patch: Partial<LoggedHand>) => void;
  clear: () => void;
}

const MAX_HANDS = 50;

export const useHandLog = create<HandLogState>()(
  persist(
    (set) => ({
      hands: [],
      upsert: (h) =>
        set((s) => {
          const idx = s.hands.findIndex((x) => x.id === h.id);
          let next: LoggedHand[];
          if (idx >= 0) {
            next = [...s.hands];
            next[idx] = { ...next[idx], ...h };
          } else {
            next = [h, ...s.hands];
          }
          if (next.length > MAX_HANDS) next = next.slice(0, MAX_HANDS);
          return { hands: next };
        }),
      finalize: (id, patch) =>
        set((s) => {
          const idx = s.hands.findIndex((x) => x.id === id);
          if (idx < 0) return s;
          const next = [...s.hands];
          next[idx] = { ...next[idx], ...patch };
          return { hands: next };
        }),
      clear: () => set({ hands: [] }),
    }),
    { name: "pokerwatch.handlog" },
  ),
);
