// Full-frame extraction. Sends the captured JPEG dataUrl to the edge function
// `analyze-poker` (mode "full-frame") and gets back a complete GameState.
//
// This is the v1 default while the local T1 pipeline (card templates + ROI OCR)
// is still being calibrated. Cost is controlled by the perceptual-hash gate in
// the caller — we only invoke this when the frame has actually changed.

import { supabase } from "@/lib/supabase";
import type { GameState } from "@/types/game";

export interface ExtractFullArgs {
  dataUrl: string;
  platform?: string;
  heroName?: string | null;
  sessionId?: string;
}

export interface ExtractFullResult {
  ok: boolean;
  gameState?: GameState;
  error?: string;
}

export async function extractFull(args: ExtractFullArgs): Promise<ExtractFullResult> {
  if (!args.dataUrl) {
    return { ok: false, error: "no frame data" };
  }
  try {
    const { data, error } = await supabase.functions.invoke("analyze-poker", {
      body: {
        mode: "full-frame",
        dataUrl: args.dataUrl,
        platform: args.platform ?? "stake.us",
        heroName: args.heroName ?? null,
        context: args.sessionId ? { sessionId: args.sessionId } : undefined,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "unknown error" };
    const gs = data.gameState as Partial<GameState> | undefined;
    if (!gs || typeof gs !== "object") {
      return { ok: false, error: "no gameState in response" };
    }
    // Coerce missing fields to safe defaults the UI expects.
    const safe: GameState = {
      platform: gs.platform ?? args.platform ?? "stake.us",
      tableId: gs.tableId ?? null,
      blinds: gs.blinds ?? { sb: 0, bb: 0 },
      ante: gs.ante ?? 0,
      stakeCurrency: gs.stakeCurrency ?? "chips",
      street: gs.street ?? "between",
      pot: gs.pot ?? 0,
      toCall: gs.toCall ?? 0,
      board: Array.isArray(gs.board) ? gs.board : [],
      myHole: Array.isArray(gs.myHole) ? gs.myHole : [],
      mySeat: gs.mySeat ?? null,
      myStack: gs.myStack ?? 0,
      seats: Array.isArray(gs.seats) ? gs.seats : [],
      actionOnSeat: gs.actionOnSeat ?? null,
      myTurn: gs.myTurn ?? false,
      actionHistory: Array.isArray(gs.actionHistory) ? gs.actionHistory : [],
      confidence: gs.confidence ?? 0,
      capturedAt: gs.capturedAt ?? Date.now(),
    };
    return { ok: true, gameState: safe };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
