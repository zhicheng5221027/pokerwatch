// In-memory loop debug state — surfaced in the UI so we can see what's happening
// in production without devtools.
import { create } from "zustand";

type Kind = "idle" | "calling" | "ok" | "err" | "skip";

interface DebugState {
  framesSeen: number;
  status: Kind;
  message: string;
  updatedAt: number;
  bumpFramesSeen: () => void;
  setStatus: (kind: Kind, message: string) => void;
  reset: () => void;
}

export const useDebug = create<DebugState>((set) => ({
  framesSeen: 0,
  status: "idle",
  message: "waiting for first frame",
  updatedAt: 0,
  bumpFramesSeen: () => set((s) => ({ framesSeen: s.framesSeen + 1 })),
  setStatus: (kind, message) =>
    set({ status: kind, message, updatedAt: Date.now() }),
  reset: () =>
    set({
      framesSeen: 0,
      status: "idle",
      message: "waiting for first frame",
      updatedAt: 0,
    }),
}));
