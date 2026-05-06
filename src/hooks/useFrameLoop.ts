// Per-frame orchestrator. Subscribes to useScreenCapture's frames and drives
// the T0/T1/T2/T3 pipeline. The pipeline modules (vision/extractLocal,
// vision/llmRepair, engine/preflop/decide, engine/postflop/decide,
// engine/aiPrompt) ship in parallel — this hook tolerates any of them being
// missing at runtime and renders a placeholder Recommendation instead.
//
// Once those modules are stable they should be statically imported; for now
// we dynamic-import inside the loop so the UI builds and runs in isolation.
import { useEffect, useRef } from "react";
import type {
  GameState,
  Recommendation,
} from "@/types/game";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";
import type { CaptureFrame, UseScreenCaptureReturn } from "./useScreenCapture";

type AnyFn = (...args: unknown[]) => unknown;

interface PipelineModules {
  extractLocal?: AnyFn;
  llmRepair?: AnyFn;
  preflopDecide?: AnyFn;
  postflopDecide?: AnyFn;
  composePrompt?: AnyFn;
}

const FALLBACK_REC: Recommendation = {
  action: "wait",
  reasoning: "Calibrating… waiting for table read.",
  confidence: 0,
  source: "fallback",
};

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[useFrameLoop] ${msg}`);
}

async function loadPipeline(): Promise<PipelineModules> {
  const out: PipelineModules = {};
  // vision/extractLocal
  try {
    const m = (await import(
      /* @vite-ignore */ "@/vision/extractLocal"
    )) as Record<string, unknown>;
    const fn = (m.extractLocal ?? m.default) as AnyFn | undefined;
    if (typeof fn === "function") out.extractLocal = fn;
  } catch {
    warnOnce("extractLocal", "vision/extractLocal not present yet — UI will render placeholders.");
  }
  // vision/llmRepair
  try {
    const m = (await import(
      /* @vite-ignore */ "@/vision/llmRepair"
    )) as Record<string, unknown>;
    const fn = (m.llmRepair ?? m.default) as AnyFn | undefined;
    if (typeof fn === "function") out.llmRepair = fn;
  } catch {
    warnOnce("llmRepair", "vision/llmRepair not present yet — skipping AI vision repair.");
  }
  // engine/preflop/decide
  try {
    const m = (await import(
      /* @vite-ignore */ "@/engine/preflop/decide"
    )) as Record<string, unknown>;
    const fn = (m.decide ?? m.decidePreflop ?? m.default) as AnyFn | undefined;
    if (typeof fn === "function") out.preflopDecide = fn;
  } catch {
    warnOnce("preflopDecide", "engine/preflop/decide not present yet — preflop will fall through.");
  }
  // engine/postflop/decide
  try {
    const m = (await import(
      /* @vite-ignore */ "@/engine/postflop/decide"
    )) as Record<string, unknown>;
    const fn = (m.decide ?? m.decidePostflop ?? m.default) as AnyFn | undefined;
    if (typeof fn === "function") out.postflopDecide = fn;
  } catch {
    warnOnce("postflopDecide", "engine/postflop/decide not present yet — postflop will use fallback.");
  }
  // engine/aiPrompt (used by postflop AI escalation; not required to render)
  try {
    const m = (await import(
      /* @vite-ignore */ "@/engine/aiPrompt"
    )) as Record<string, unknown>;
    const fn = (m.composeStrategyPrompt ?? m.default) as AnyFn | undefined;
    if (typeof fn === "function") out.composePrompt = fn;
  } catch {
    warnOnce("composePrompt", "engine/aiPrompt not present yet — AI strategy stage will be skipped.");
  }
  return out;
}

function isRecommendation(x: unknown): x is Recommendation {
  return (
    !!x && typeof x === "object" && "action" in (x as Recommendation)
  );
}

function isGameState(x: unknown): x is GameState {
  return !!x && typeof x === "object" && "street" in (x as GameState);
}

export function useFrameLoop(capture: UseScreenCaptureReturn) {
  const setRecommendation = useSessionStore((s) => s.setRecommendation);
  const setGameState = useSessionStore((s) => s.setGameState);
  const isActive = useSessionStore((s) => s.isActive);
  const platform = useSettings((s) => s.platform);
  const heroName = useSettings((s) => s.heroName);

  const pipelineRef = useRef<PipelineModules | null>(null);
  const inflightRef = useRef(false);

  // Load pipeline modules once.
  useEffect(() => {
    let alive = true;
    void loadPipeline().then((p) => {
      if (alive) pipelineRef.current = p;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const unsub = capture.subscribe(async (f: CaptureFrame) => {
      if (inflightRef.current) return; // drop overlapping frames
      inflightRef.current = true;
      try {
        const p = pipelineRef.current ?? {};
        let gs: GameState | null = null;

        if (p.extractLocal) {
          try {
            const result = (await Promise.resolve(
              p.extractLocal({
                frame: f.frame,
                dataUrl: f.dataUrl,
                width: f.width,
                height: f.height,
                platform,
                heroName,
              }),
            )) as unknown;
            if (isGameState(result)) gs = result;
            else if (
              result &&
              typeof result === "object" &&
              "gameState" in result
            ) {
              const inner = (result as { gameState?: unknown }).gameState;
              if (isGameState(inner)) gs = inner;
            }
          } catch (err) {
            warnOnce("extractLocal-throw", `extractLocal threw: ${String(err)}`);
          }
        }

        if (gs) setGameState(gs);

        let rec: Recommendation | null = null;

        // Try preflop chart first if applicable.
        if (gs && gs.street === "preflop" && p.preflopDecide) {
          try {
            const r = (await Promise.resolve(p.preflopDecide(gs))) as unknown;
            if (isRecommendation(r)) rec = r;
          } catch (err) {
            warnOnce("preflopDecide-throw", `preflopDecide threw: ${String(err)}`);
          }
        }

        // Postflop / fall-through to AI strategy.
        if (!rec && gs && p.postflopDecide) {
          try {
            const r = (await Promise.resolve(p.postflopDecide(gs))) as unknown;
            if (isRecommendation(r)) rec = r;
          } catch (err) {
            warnOnce("postflopDecide-throw", `postflopDecide threw: ${String(err)}`);
          }
        }

        if (!rec) rec = FALLBACK_REC;
        setRecommendation(rec);
      } finally {
        inflightRef.current = false;
      }
    });
    return () => unsub();
  }, [
    capture,
    isActive,
    platform,
    heroName,
    setGameState,
    setRecommendation,
  ]);
}
