// Full-frame extraction via the `analyze-poker` edge function.
// Uses direct fetch + AbortController so we can enforce a hard timeout — the
// supabase-js client has been observed to hang on slow responses and lock the
// frame loop's inflight ref.

import type { GameState } from "@/types/game";

const VISION_TIMEOUT_MS = 30_000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

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
  status?: number;
}

export async function extractFull(args: ExtractFullArgs): Promise<ExtractFullResult> {
  if (!args.dataUrl) {
    return { ok: false, error: "no frame data" };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: "Supabase env vars missing" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-poker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        mode: "full-frame",
        dataUrl: args.dataUrl,
        platform: args.platform ?? "stake.us",
        heroName: args.heroName ?? null,
        context: args.sessionId ? { sessionId: args.sessionId } : undefined,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status };
    }

    const data = await res.json();
    if (!data?.ok) {
      return { ok: false, error: data?.error ?? "unknown error" };
    }
    const gs = data.gameState as Partial<GameState> | undefined;
    if (!gs || typeof gs !== "object") {
      return { ok: false, error: "no gameState in response" };
    }

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
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, error: `timed out after ${VISION_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// --- Strategy call (also fetch-based for the same reason) ---

export interface StrategyArgs {
  gameState: GameState;
  math: Record<string, unknown>;
  riskProfile?: "tight" | "standard" | "loose";
  recentHands?: unknown[];
  sessionId?: string;
}

export async function callStrategy(args: StrategyArgs): Promise<{ ok: boolean; recommendation?: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-poker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        mode: "strategy",
        gameState: args.gameState,
        math: args.math,
        riskProfile: args.riskProfile ?? "standard",
        recentHands: args.recentHands ?? [],
        context: args.sessionId ? { sessionId: args.sessionId } : undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data?.ok) return { ok: false, error: data?.error ?? "no recommendation" };
    return { ok: true, recommendation: data.recommendation };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, error: `strategy timed out after ${VISION_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}
