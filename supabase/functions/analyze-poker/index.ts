// supabase/functions/analyze-poker/index.ts
//
// PokerWatch edge function. Two routes via the `mode` field in the request body:
//   - "vision-repair" — given cropped ROI dataURLs the local extractor couldn't
//     read, return the missing fields as strict JSON (T2 in the cost tier doc).
//   - "strategy"      — given a merged GameState + pre-computed math + opponent
//     profile + recent hands, return a Recommendation (T3).
//
// Both routes use OpenAI gpt-5.5 (the user has specified this model id verbatim;
// do not substitute). The strategy route caches by spotSignature in the
// `strategy_cache` table. Cost telemetry is written to `sessions` best-effort.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_MODEL = "gpt-5.5"; // requested verbatim by user
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const STRATEGY_SYSTEM_PROMPT = `You are PokerWatch, a No-Limit Hold'em coach. You receive structured
game state and pre-computed math. You DO NOT recompute math; you use it.
Respond with strict JSON: { action, sizing?, reasoning, alternatives?, confidence }.
Honor the user's risk profile and the strategy foundations cheat-sheet below.

CHEATSHEET:
- Position over cards. Pot control. Fold equity is currency.
- Bankroll-protect: never recommend committing > 1 buy-in on tilt.
- Use SPR: low => commit with TPGK+, mid => pot-control marginals, high => big-hand poker.
- Sizing tiers: 25-33 dry/range, 50-66 std, 75-100 polar wet, overbets only with nut adv.
- vs calling station: thin value, almost no bluffs.
- vs nit: bluff more, fold to aggression.
- Tilt risk flagged => bias to fold/check-call.

INPUT (in user message as JSON):
GAME STATE: {GameState JSON}
PRE-COMPUTED MATH: { potOdds, mdf, sprBucket, equityVsRange, commitFlag, preflopChartHint }
OPPONENT: { vpip, pfr, af, label }
RECENT HANDS (for flow): [{ ... }, ...]  // <= 10
RISK PROFILE: tight | standard | loose
TILT FLAGS: [...]

DECIDE.

OUTPUT FORMAT (strict JSON only — no prose, no markdown):
{
  "action": "fold" | "check" | "call" | "raise" | "all-in" | "wait",
  "sizing": <number, only for raise; chips>,
  "reasoning": "<one sentence, <=140 chars>",
  "confidence": <0..100 number>,
  "equityVsRange": <0..100 number, optional>,
  "potOdds": <0..100 number, optional>,
  "mdf": <0..100 number, optional>,
  "spr": <number, optional>,
  "committed": <boolean, optional>,
  "alternatives": [{ "action": "...", "sizing": <num?>, "weight": <0..1> }],
  "source": "ai-strategy"
}`;

const VISION_SYSTEM_PROMPT = `You are PokerWatch's vision repair module. The local extractor failed to read
some fields from a poker table screenshot and is sending you ONLY the cropped
ROI(s) it couldn't read. You will be given a list of expected field names and
one image per field.

Return STRICT JSON ONLY — no prose, no markdown — with one top-level key per
requested field. Use these conventions:

- Cards: 2-char strings, rank then suit, suits lowercase: "As", "Kh", "Td", "9c".
- "hole_cards" / "board" => array of card strings.
- "pot" / "to_call" / "stack" / "my_stack" => integer chips (no commas, no symbols).
- "blinds" => { "sb": <int>, "bb": <int> }.
- "position" => one of UTG, UTG1, MP, MP1, HJ, CO, BTN, SB, BB.
- "street" => one of preflop, flop, turn, river, showdown, between.
- "seat_names" => array of strings (or null per seat if unreadable).
- If a field cannot be read with reasonable confidence, set it to null.

Return ONLY the requested fields, nothing else.`;

const ALLOWED_ACTIONS = new Set([
  "fold",
  "check",
  "call",
  "raise",
  "all-in",
  "wait",
]);

const VISION_COST_PER_CALL = 0.001;
const STRATEGY_COST_PER_CALL = 0.003;

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface VisionRepairRequest {
  mode: "vision-repair";
  missingFields: string[];
  crops: Record<string, string>; // field -> dataUrl
  context?: { sessionId?: string; [k: string]: unknown };
}

interface StrategyRequest {
  mode: "strategy";
  gameState: Record<string, unknown>;
  math: Record<string, unknown>;
  profile?: Record<string, unknown>;
  recentHands?: unknown[];
  riskProfile?: "tight" | "standard" | "loose";
  tilt?: Record<string, unknown>;
  preflopHint?: unknown;
  context?: { sessionId?: string; [k: string]: unknown };
}

type Req = VisionRepairRequest | StrategyRequest;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  // --- env load ---
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse(
      { ok: false, error: "OPENAI_API_KEY not configured" },
      500,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin: SupabaseClient | null =
    supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  // --- body parse ---
  let body: Req;
  try {
    body = (await req.json()) as Req;
  } catch (_e) {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object" || !("mode" in body)) {
    return jsonResponse({ ok: false, error: "missing mode" }, 400);
  }

  // --- mode switch ---
  try {
    if (body.mode === "vision-repair") {
      const result = await handleVisionRepair(body, openaiKey);
      // Best-effort cost telemetry (T2 = 0.001).
      void bumpSessionCost(admin, body.context?.sessionId, "t2");
      return jsonResponse(result);
    }

    if (body.mode === "strategy") {
      const result = await handleStrategy(body, openaiKey, admin);
      // Only count an OpenAI call when we actually called OpenAI (cache miss).
      if (result.cacheHit !== true) {
        void bumpSessionCost(admin, body.context?.sessionId, "t3");
      }
      return jsonResponse({
        ok: true,
        recommendation: result.recommendation,
        cached: result.cacheHit === true,
      });
    }

    return jsonResponse({ ok: false, error: "unknown mode" }, 400);
  } catch (err) {
    return openaiErrorToResponse(err);
  }
});

// ---------------------------------------------------------------------------
// Vision repair
// ---------------------------------------------------------------------------

async function handleVisionRepair(
  body: VisionRepairRequest,
  openaiKey: string,
): Promise<{ ok: true; fields: Record<string, unknown> }> {
  const missing = Array.isArray(body.missingFields) ? body.missingFields : [];
  const crops = body.crops ?? {};
  if (missing.length === 0) {
    return { ok: true, fields: {} };
  }

  // Build a single user message containing a text instruction + one image_url
  // per requested field. The instruction enumerates field names so the model
  // knows which image goes with which field.
  const userParts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        "Read the following cropped regions from a poker table screenshot.\n" +
        "Return STRICT JSON with exactly these top-level keys: " +
        JSON.stringify(missing) +
        ".\nEach image below is labeled with the field it corresponds to.",
    },
  ];

  for (const field of missing) {
    const dataUrl = crops[field];
    if (!dataUrl) {
      // Tell the model the crop is missing for this field; it should null it.
      userParts.push({
        type: "text",
        text: `Field "${field}": (no image provided — return null)`,
      });
      continue;
    }
    userParts.push({ type: "text", text: `Field "${field}":` });
    userParts.push({
      type: "image_url",
      image_url: { url: dataUrl, detail: "low" },
    });
  }

  const openaiBody = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      { role: "user", content: userParts },
    ],
    response_format: { type: "json_object" },
  };

  const raw = await callOpenAI(openaiKey, openaiBody);
  const fields = parseJsonContent(raw);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new HttpError(502, "vision response was not a JSON object");
  }
  // Shallow shape check: every requested field key should exist (may be null).
  const out: Record<string, unknown> = {};
  for (const field of missing) {
    out[field] = (fields as Record<string, unknown>)[field] ?? null;
  }

  return { ok: true, fields: out };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

async function handleStrategy(
  body: StrategyRequest,
  openaiKey: string,
  admin: SupabaseClient | null,
): Promise<{ recommendation: Record<string, unknown>; cacheHit: boolean }> {
  const gs = body.gameState ?? {};
  const sigPayload = {
    board: (gs as Record<string, unknown>).board ?? null,
    myHole: (gs as Record<string, unknown>).myHole ?? null,
    actionHistory: (gs as Record<string, unknown>).actionHistory ?? null,
    pot: (gs as Record<string, unknown>).pot ?? null,
    toCall: (gs as Record<string, unknown>).toCall ?? null,
    myStack: (gs as Record<string, unknown>).myStack ?? null,
    street: (gs as Record<string, unknown>).street ?? null,
    riskProfile: body.riskProfile ?? "standard",
  };
  const spotSignature = await sha256Hex(JSON.stringify(sigPayload));

  // Cache lookup (best-effort; if it fails, we just proceed).
  if (admin) {
    try {
      const { data } = await admin
        .from("strategy_cache")
        .select("recommendation, hits")
        .eq("spot_signature", spotSignature)
        .maybeSingle();
      if (data?.recommendation) {
        // Bump hit counter, fire-and-forget.
        const currentHits =
          typeof (data as Record<string, unknown>).hits === "number"
            ? ((data as Record<string, number>).hits ?? 0)
            : 0;
        void admin
          .from("strategy_cache")
          .update({ hits: currentHits + 1 })
          .eq("spot_signature", spotSignature)
          .then(() => undefined, () => undefined);
        return {
          recommendation: data.recommendation as Record<string, unknown>,
          cacheHit: true,
        };
      }
    } catch (_e) {
      // ignore cache read failure
    }
  }

  // Cache miss → call OpenAI.
  const userPayload = {
    gameState: gs,
    math: body.math ?? {},
    opponent: body.profile ?? null,
    recentHands: (body.recentHands ?? []).slice(0, 10),
    riskProfile: body.riskProfile ?? "standard",
    tilt: body.tilt ?? null,
    preflopHint: body.preflopHint ?? null,
  };

  const openaiBody = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: STRATEGY_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    response_format: { type: "json_object" },
  };

  const raw = await callOpenAI(openaiKey, openaiBody);
  const parsed = parseJsonContent(raw);
  const recommendation = validateRecommendation(parsed);

  // Fire-and-forget cache write (don't block the response).
  if (admin) {
    void admin
      .from("strategy_cache")
      .insert({ spot_signature: spotSignature, recommendation })
      .then(() => undefined, () => undefined);
  }

  return { recommendation, cacheHit: false };
}

// ---------------------------------------------------------------------------
// OpenAI call
// ---------------------------------------------------------------------------

async function callOpenAI(
  openaiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const status = res.status;
    let msg = `openai error ${status}`;
    try {
      const errBody = await res.json();
      const errText =
        (errBody?.error?.message as string | undefined) ??
        (typeof errBody === "string" ? errBody : undefined);
      if (errText) msg = errText;
    } catch (_e) {
      // keep default msg
    }
    // Map common cases to actionable status codes.
    if (status === 429) throw new HttpError(429, msg);
    if (status === 402) throw new HttpError(402, msg);
    if (status === 401) throw new HttpError(500, "OpenAI auth failed");
    throw new HttpError(502, msg);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new HttpError(502, "openai returned empty content");
  }
  return content;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function openaiErrorToResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return jsonResponse({ ok: false, error: err.message }, err.status);
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return jsonResponse({ ok: false, error: message }, 500);
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (_e) {
    // Some models occasionally wrap JSON in code fences even with response_format
    // forced. Try to recover by extracting the first {...} block.
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch (_e2) {
        // fall through
      }
    }
    throw new HttpError(502, "openai content was not valid JSON");
  }
}

function validateRecommendation(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(502, "recommendation was not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const action = obj.action;
  if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    throw new HttpError(502, `invalid action: ${String(action)}`);
  }
  if (typeof obj.confidence !== "number") {
    // Coerce strings like "82" defensively.
    const n = Number(obj.confidence);
    if (!Number.isFinite(n)) {
      throw new HttpError(502, "confidence is not a number");
    }
    obj.confidence = n;
  }
  if (typeof obj.reasoning !== "string") {
    obj.reasoning = "";
  }
  obj.source = "ai-strategy";
  return obj;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    hex += h.length === 1 ? "0" + h : h;
  }
  return hex;
}

async function bumpSessionCost(
  admin: SupabaseClient | null,
  sessionId: string | undefined,
  tier: "t2" | "t3",
): Promise<void> {
  if (!admin || !sessionId) return;
  try {
    const { data, error } = await admin
      .from("sessions")
      .select("ai_calls_t2, ai_calls_t3, estimated_cost_usd")
      .eq("id", sessionId)
      .maybeSingle();
    if (error || !data) return;
    const current = data as {
      ai_calls_t2: number | null;
      ai_calls_t3: number | null;
      estimated_cost_usd: number | null;
    };
    const t2 = current.ai_calls_t2 ?? 0;
    const t3 = current.ai_calls_t3 ?? 0;
    const cost = Number(current.estimated_cost_usd ?? 0);
    const update =
      tier === "t2"
        ? {
            ai_calls_t2: t2 + 1,
            estimated_cost_usd: cost + VISION_COST_PER_CALL,
          }
        : {
            ai_calls_t3: t3 + 1,
            estimated_cost_usd: cost + STRATEGY_COST_PER_CALL,
          };
    await admin.from("sessions").update(update).eq("id", sessionId);
  } catch (_e) {
    // swallow — telemetry is best-effort
  }
}

