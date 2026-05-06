// T2 — vision repair via the `analyze-poker` Supabase edge function.
//
// We send only the cropped ROIs we couldn't read locally, never the full
// frame, and only the fields we still need filled. The edge function
// invokes gpt-5.5 vision in `mode: "vision-repair"` and returns the
// missing fields as a strict JSON object.
//
// See PRD §10 (T2) and plan §4.

import { supabase } from "@/lib/supabase";
import type { GameState } from "@/types/game";

export interface RepairInput {
  /** Field paths that local extraction couldn't determine, e.g.
   *  ["pot", "seat3.stack", "myHole[0]", "blinds"]. */
  missingFields: string[];
  /** A small map of `fieldName -> dataUrl` (JPEG/PNG) of just the cropped
   *  region the LLM should look at. Keep crops < 200x200 to keep tokens cheap. */
  crops: Record<string, string>;
  /** Tiny subset of partial state the model needs as context (e.g.
   *  current `street`, known `board` cards, `platform`). Don't send the
   *  whole GameState — keep payload small. */
  context: Partial<GameState>;
}

export interface RepairOutput {
  /** Fields the LLM was able to recover. May be partial — caller should
   *  re-check for any still-missing fields. */
  fields: Record<string, unknown>;
  /** 0..1 self-reported confidence by the LLM. */
  confidence: number;
  /** True if the call succeeded. False ⇒ network/auth/quota error and
   *  the caller should fall back to displaying low-confidence local data. */
  ok: boolean;
  /** Optional error message for logging. */
  error?: string;
}

/** Request signature for `supabase.functions.invoke('analyze-poker', …)`. */
interface AnalyzePokerVisionRepairBody {
  mode: "vision-repair";
  missingFields: string[];
  crops: Record<string, string>;
  context: Partial<GameState>;
}

interface AnalyzePokerVisionRepairResponse {
  fields?: Record<string, unknown>;
  confidence?: number;
  error?: string;
}

export async function llmRepair(input: RepairInput): Promise<RepairOutput> {
  if (input.missingFields.length === 0) {
    return { fields: {}, confidence: 1, ok: true };
  }

  const body: AnalyzePokerVisionRepairBody = {
    mode: "vision-repair",
    missingFields: input.missingFields,
    crops: input.crops,
    context: input.context,
  };

  try {
    const { data, error } = await supabase.functions.invoke<
      AnalyzePokerVisionRepairResponse
    >("analyze-poker", { body });

    if (error) {
      return {
        fields: {},
        confidence: 0,
        ok: false,
        error: error.message ?? String(error),
      };
    }

    const payload = (data ?? {}) as AnalyzePokerVisionRepairResponse;
    return {
      fields: payload.fields ?? {},
      confidence:
        typeof payload.confidence === "number" ? payload.confidence : 0.5,
      ok: true,
      error: payload.error,
    };
  } catch (err) {
    return {
      fields: {},
      confidence: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
