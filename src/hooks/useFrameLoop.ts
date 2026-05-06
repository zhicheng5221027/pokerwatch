// Per-frame orchestrator. Subscribes to useScreenCapture and:
//   1. Skips if the frame is identical to the previous one (perceptual-hash gate)
//   2. Calls the edge function `analyze-poker` (mode: full-frame) to get a
//      complete GameState — this is the v1 default while local T1 templates are
//      still being calibrated.
//   3. If `myTurn` is true, calls the strategy mode for a Recommendation.
//   4. Always updates the session store with the latest GameState so the UI
//      reflects what the AI sees on the table, even on opponents' turns.
import { useCallback, useEffect, useRef } from "react";
import type { GameState, Recommendation } from "@/types/game";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";
import type { CaptureFrame, UseScreenCaptureReturn } from "./useScreenCapture";
import { extractFull } from "@/vision/extractFull";
import { supabase } from "@/lib/supabase";

const WAITING_REC: Recommendation = {
  action: "wait",
  reasoning: "Not your turn — watching the table.",
  confidence: 0,
  source: "fallback",
};

const SCANNING_REC: Recommendation = {
  action: "wait",
  reasoning: "Reading the table…",
  confidence: 0,
  source: "fallback",
};

// Cheap, non-cryptographic frame fingerprint built from the JPEG dataUrl.
// Identical capture → identical string → we skip the round trip.
function fingerprintDataUrl(dataUrl: string): string {
  // Sample evenly across the base64 body.
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
  const isActive = useSessionStore((s) => s.isActive);
  const sessionId = useSessionStore((s) => s.id);
  const platform = useSettings((s) => s.platform);
  const heroName = useSettings((s) => s.heroName);
  const riskProfile = useSettings((s) => s.riskProfile);

  const lastFingerprintRef = useRef<string>("");
  const inflightRef = useRef(false);

  const handleFrame = useCallback(
    async (f: CaptureFrame) => {
      if (!f.dataUrl) return;
      if (inflightRef.current) return;

      const fp = fingerprintDataUrl(f.dataUrl);
      if (fp === lastFingerprintRef.current) return; // unchanged frame
      lastFingerprintRef.current = fp;

      inflightRef.current = true;
      // Optimistic placeholder so the user sees activity.
      setRecommendation(SCANNING_REC);

      try {
        const res = await extractFull({
          dataUrl: f.dataUrl,
          platform,
          heroName,
          sessionId: sessionId ?? undefined,
        });

        if (!res.ok || !res.gameState) {
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

        // No active hand visible? Don't burn a strategy call.
        if (gs.street === "between" || gs.street === "showdown") {
          setRecommendation({
            action: "wait",
            reasoning: gs.street === "showdown" ? "Showdown — table resolving." : "Between hands — waiting for deal.",
            confidence: 0,
            source: "fallback",
          });
          return;
        }

        if (!gs.myTurn) {
          setRecommendation(WAITING_REC);
          return;
        }

        // Hero's turn — ask for a recommendation.
        // Local pre-computed math kept minimal here; the engine modules can
        // enrich this once the local pipeline is wired in.
        const potOdds = gs.toCall > 0 ? Math.round((gs.toCall / (gs.pot + gs.toCall)) * 100) : 0;
        const sprValue = gs.pot > 0 ? gs.myStack / gs.pot : 999;
        const sprBucket = sprValue <= 4 ? "low" : sprValue <= 13 ? "mid" : "high";
        const math = {
          potOdds,
          mdf: gs.toCall > 0 ? Math.round((gs.pot / (gs.pot + gs.toCall)) * 100) : 0,
          sprBucket,
          spr: Number.isFinite(sprValue) ? Math.round(sprValue * 10) / 10 : null,
          equityVsRange: null,
          commitFlag: false,
          preflopChartHint: null,
        };

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
        if (error) {
          setRecommendation({
            action: "wait",
            reasoning: `Strategy error: ${error.message}`,
            confidence: 0,
            source: "fallback",
          });
          return;
        }
        if (data?.ok && data.recommendation) {
          setRecommendation({
            ...(data.recommendation as Recommendation),
            potOdds: data.recommendation.potOdds ?? potOdds,
            mdf: data.recommendation.mdf ?? math.mdf,
            spr: data.recommendation.spr ?? (math.spr as number | undefined),
            source: "ai-strategy",
          });
          return;
        }
        setRecommendation({
          action: "wait",
          reasoning: data?.error ?? "no recommendation",
          confidence: 0,
          source: "fallback",
        });
      } catch (err) {
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
    [platform, heroName, riskProfile, sessionId, setGameState, setRecommendation],
  );

  useEffect(() => {
    if (!isActive) return;
    const unsub = capture.subscribe(handleFrame);
    return () => unsub();
  }, [capture, isActive, handleFrame]);
}
