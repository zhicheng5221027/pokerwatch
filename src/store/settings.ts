// Persisted user settings store. See PRD §4.4 settings drawer.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Platform = "stake.us" | "pokerstars" | "ggpoker" | "acr" | "generic";
export type RiskProfile = "tight" | "standard" | "loose";

export interface SettingsState {
  heroName: string;
  platform: Platform;
  /** Capture interval in ms. PRD: default 2.5s, range 1–10s. */
  captureIntervalMs: number;
  riskProfile: RiskProfile;
  aiModel: string;
  keepHistory: boolean;
  bankrollChips: number;

  setHeroName: (v: string) => void;
  setPlatform: (v: Platform) => void;
  setCaptureIntervalMs: (v: number) => void;
  setRiskProfile: (v: RiskProfile) => void;
  setAiModel: (v: string) => void;
  setKeepHistory: (v: boolean) => void;
  setBankrollChips: (v: number) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      heroName: "",
      platform: "stake.us",
      captureIntervalMs: 2500,
      riskProfile: "standard",
      aiModel: "gpt-5.5",
      keepHistory: true,
      bankrollChips: 0,

      setHeroName: (v) => set({ heroName: v }),
      setPlatform: (v) => set({ platform: v }),
      setCaptureIntervalMs: (v) =>
        set({ captureIntervalMs: Math.max(1000, Math.min(10000, v)) }),
      setRiskProfile: (v) => set({ riskProfile: v }),
      setAiModel: (v) => set({ aiModel: v }),
      setKeepHistory: (v) => set({ keepHistory: v }),
      setBankrollChips: (v) => set({ bankrollChips: Math.max(0, v) }),
    }),
    { name: "pokerwatch.settings" },
  ),
);
