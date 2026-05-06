// Per-frame orchestrator. Runs whenever capture is sharing (no longer gated on
// session.isActive — the session is for cloud logging, not UI rendering).
//
// Pipeline per frame:
//   1. Skip if dataUrl is missing or fingerprint matches the previous frame.
//   2. Set a "Reading the table…" placeholder so the UI shows activity.
//   3. Call edge fn `analyze-poker` (mode: full-frame) for a complete GameState.
//   4. If hero's turn, call mode: strategy for a Recommendation.
//   5. Surface counts/errors on a debug store so the UI can show what happened.
import { useCallback, useEffect, useRef } from "react";
import type { GameState, Recommendation } from "@/types/game";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useDebug } from "@/store/debug";
import type { CaptureFrame, UseScreenCaptureReturn } from "./useScreenCapture";
import { extractFull } from "@/vision/extractFull";
import { supabase } from "@/lib/supabase";

const SCANNING_REC: Recommendation = {
  action: "wait",
  reasoning: "Reading the table…",
  confidence: 0,
  source: "fallback",
};

const WAITING_REC: Recommendation = {
  action: "wait",
  reasoning: "Not your turn — watching the table.",
  confidence: 0,
  source: "fallback",
};

function fingerprintDataUrl(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const len = base64.length;
  if (len < 64) return base64;
  let h = 0;
  const stride = Math.max(1, Math.floor(len / 256));
  for (let i = 0; i < len; i += stride) {
    h = ((h << 5) - h + base64.charCodeAt(i)) | 0;
  }
  return `${len}:${h}`;
}

export function useFrameLoop(capture: UseScreenCaptureReturn) {
  const setRecommendation = useSessionStore((s) => s.setRecommendation);
  const setGameState = useSessionStore((s) => s.setGameState);
  const sessionId = useSessionStore((s) => s.id);
  const platform = useSettings((s) => s.platform);
  const heroName = useSettings((s) => s.heroName);
  const riskProfile = useSettings((s) => s.riskProfile);

  const debug = useDebug();

  const lastFingerprintRef = useRef<string>("");
  const inflightRef = useRef(false);

  const handleFrame = useCallback(
    async (f: CaptureFrame) => {
      debug.bumpFramesSeen();
      if (!f.dataUrl) {
        debug.setStatus("err", "no dataUrl");
        return;
      }
      if (inflightRef.current) {
        debug.setStatus("skip", "in-flight");
        return;
      }

      const fp = fingerprintDataUrl(f.dataUrl);
      if (fp === lastFingerprintRef.current) {
        debug.setStatus("skip", "frame unchanged");
        return;
      }
      lastFingerprintRef.current = fp;

      inflightRef.current = true;
      debug.setStatus("calling", "vision…");
      // Show activity immediately so the UI doesn't sit on the null fallback.
      setRecommendation(SCANNING_REC);

      try {
        const t0 = Date.now();
        const res = await extractFull({
          dataUrl: f.dataUrl,
          platform,
          heroName,
          sessionId: sessionId ?? undefined,
        });
        const dt = Date.now() - t0;

        if (!res.ok || !res.gameState) {
          debug.setStatus("err", `vision: ${res.error ?? "no read"} (${dt}ms)`);
          setRecommendation({
            action: "wait",
            reasoning: `Vision: ${res.error ?? "no read"}`,
            confidence: 0,
            source: "fallback",
          });
          return;
        }

        const gs: GameState = res.gameState;
        setGameState(gs);
        debug.setStatus(
          "ok",
          `vision ${dt}ms · ${gs.street} · pot ${gs.pot} · myTurn ${gs.myTurn}`,
        );

        if (gs.street === "between" || gs.street === "showdown") {
          setRecommendation({
            action: "wait",
            reasoning:
              gs.street === "showdown"
                ? "Showdown — table resolving."
                : "Between hands — waiting for deal.",
            confidence: 0,
            source: "fallback",
          });
          return;
        }

        if (!gs.myTurn) {
          setRecommendation(WAITING_REC);
          return;
        }

        // Hero's turn — fetch a recommendation.
        const potOdds =
          gs.toCall > 0 ? Math.round((gs.toCall / (gs.pot + gs.toCall)) * 100) : 0;
        const sprValue = gs.pot > 0 ? gs.myStack / gs.pot : 999;
        const sprBucket = sprValue <= 4 ? "low" : sprValue <= 13 ? "mid" : "high";
        const math = {
          potOdds,
          mdf:
            gs.toCall > 0 ? Math.round((gs.pot / (gs.pot + gs.toCall)) * 100) : 0,
          sprBucket,
          spr: Number.isFinite(sprValue) ? Math.round(sprValue * 10) / 10 : null,
          equityVsRange: null,
          commitFlag: false,
          preflopChartHint: null,
        };

        debug.setStatus("calling", "strategy…");
        const t1 = Date.now();
        const { data, error } = await supabase.functions.invoke("analyze-poker", {
          body: {
            mode: "strategy",
            gameState: gs,
            math,
            riskProfile,
            recentHands: [],
            context: sessionId ? { sessionId } : undefined,
          },
        });
        const dt2 = Date.now() - t1;
        if (error) {
          debug.setStatus("err", `strategy: ${error.message} (${dt2}ms)`);
          setRecommendation({
            action: "wait",
            reasoning: `Strategy error: ${error.message}`,
            confidence: 0,
            source: "fallback",
          });
          return;
        }
        if (data?.ok && data.recommendation) {
          debug.setStatus("ok", `strategy ${dt2}ms · ${data.recommendation.action}`);
          setRecommendation({
            ...(data.recommendation as Recommendation),
            potOdds: data.recommendation.potOdds ?? potOdds,
            mdf: data.recommendation.mdf ?? math.mdf,
            spr: data.recommendation.spr ?? (math.spr as number | undefined),
            source: "ai-strategy",
          });
          return;
        }
        debug.setStatus("err", data?.error ?? "no recommendation");
        setRecommendation({
          action: "wait",
          reasoning: data?.error ?? "no recommendation",
          confidence: 0,
          source: "fallback",
        });
      } catch (err) {
        debug.setStatus("err", String(err));
        setRecommendation({
          action: "wait",
          reasoning: `Loop error: ${String(err)}`,
          confidence: 0,
          source: "fallback",
        });
      } finally {
        inflightRef.current = false;
      }
    },
    [
      platform,
      heroName,
      riskProfile,
      sessionId,
      setGameState,
      setRecommendation,
      debug,
    ],
  );

  useEffect(() => {
    if (!capture.isSharing) return;
    const unsub = capture.subscribe(handleFrame);
    return () => unsub();
  }, [capture, handleFrame]);
}
