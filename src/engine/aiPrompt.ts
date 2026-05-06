// Composes the OpenAI strategy-mode prompt. The system message is the
// PokerWatch cheatsheet; the user message is the structured spot JSON.
// We instruct the model to emit a strict-JSON Recommendation.

import type {
  GameState,
  OpponentProfile,
  Recommendation,
  TiltState,
} from "@/types/game";
import type { PostflopHints } from "./postflop/decide";
import type { RiskProfile } from "./preflop/decide";

export interface PrecomputedMath {
  potOdds?: number;            // 0..100
  mdf?: number;                // 0..100
  equityVsRange?: number;      // 0..100
  impliedTargetChips?: number; // additional chips needed when chasing a draw
  sprValue: number;
  sprBucket: "low" | "mid" | "high";
  commitFlag: boolean;
}

export interface BuildPromptInput {
  gs: GameState;
  math: PrecomputedMath;
  profile?: OpponentProfile;
  recentHands?: Array<Pick<Recommendation, "action" | "reasoning"> & { result?: number }>;
  riskProfile: RiskProfile;
  tilt: TiltState;
  /**
   * If preflop chart returned a tentative pick, pass it as a hint.
   * Otherwise pass null.
   */
  preflopHint: Recommendation | null;
  /** Postflop hints from decidePostflopHints when applicable. */
  postflopHints: PostflopHints | null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  messages: ChatMessage[];
}

/* ---------------------------- system cheat-sheet ---------------------------- */

const SYSTEM_PROMPT = `You are PokerWatch, a No-Limit Hold'em coach.

You receive a fully structured GameState plus pre-computed math (pot odds, MDF, equity, SPR, commit flag). DO NOT recompute math; trust and cite the numbers you receive.

Respond with strict JSON ONLY (no prose, no markdown fences) matching this exact shape:
{
  "action": "fold" | "check" | "call" | "raise" | "all-in" | "wait",
  "sizing": <number, only when action="raise" — chips, not BB>,
  "reasoning": <string, <=200 chars, plain English, why>,
  "confidence": <integer 0..100>,
  "alternatives": [{ "action": "...", "sizing": <number?>, "weight": <0..1> }, ...]
}

CHEATSHEET (strategy foundations):
- Position over cards. Pot control. Fold equity is currency.
- SPR low (<=4) ⇒ commit with TPGK+; mid (4-13) ⇒ pot-control marginals; high (>13) ⇒ big-hand poker, avoid bloat.
- Sizing tiers: 25–33% of pot on dry/range bets; 50–66% standard; 75–100% polar wet/big rivers; overbets only with nut advantage.
- vs calling station: thin value, almost no bluffs.
- vs nit (VPIP <18): bluff more, fold to their aggression unless huge.
- vs maniac (VPIP/PFR high, AF >3): trap more, call down lighter.
- vs TAG: standard GTO-ish lines.
- Tilt risk flagged ⇒ bias to fold and check-call. Never recommend all-in on tilt level 3.
- COMMITTED flag ⇒ never fold a top-pair-good-kicker-or-better at low SPR.
- Use the preflopHint as your default if street=preflop and the spot is clean.
- Sizing: if you choose "raise" you MUST output a sizing in chips.
- Confidence: 90+ only when math + chart + reads agree; 60-80 typical; <60 means it's close.
`;

/* ----------------------------- user payload ----------------------------- */

function trimGameState(gs: GameState): Record<string, unknown> {
  return {
    platform: gs.platform,
    blinds: gs.blinds,
    ante: gs.ante,
    stakeCurrency: gs.stakeCurrency,
    street: gs.street,
    pot: gs.pot,
    toCall: gs.toCall,
    board: gs.board,
    myHole: gs.myHole,
    mySeat: gs.mySeat,
    myStack: gs.myStack,
    seats: gs.seats.map((s) => ({
      seatNum: s.seatNum,
      stack: s.stack,
      inHand: s.inHand,
      hasActed: s.hasActed,
      lastAction: s.lastAction,
      isHero: s.isHero,
      isDealer: s.isDealer,
    })),
    actionOnSeat: gs.actionOnSeat,
    myTurn: gs.myTurn,
    actionHistory: gs.actionHistory.slice(-30),
    confidence: gs.confidence,
  };
}

export function buildStrategyPrompt(input: BuildPromptInput): BuiltPrompt {
  const userPayload = {
    gameState: trimGameState(input.gs),
    math: input.math,
    opponent: input.profile
      ? {
          seatNum: input.profile.seatNum,
          hands: input.profile.hands,
          vpip: round1(input.profile.vpip),
          pfr: round1(input.profile.pfr),
          af: round2(input.profile.af),
          label: input.profile.label,
        }
      : null,
    recentHands: (input.recentHands ?? []).slice(-10),
    riskProfile: input.riskProfile,
    tilt: input.tilt,
    preflopHint: input.preflopHint
      ? {
          action: input.preflopHint.action,
          sizing: input.preflopHint.sizing,
          reasoning: input.preflopHint.reasoning,
          confidence: input.preflopHint.confidence,
          source: input.preflopHint.source,
        }
      : null,
    postflopHints: input.postflopHints
      ? {
          textureLabel: input.postflopHints.texture.label,
          textureFlags: {
            paired: input.postflopHints.texture.paired,
            monotone: input.postflopHints.texture.monotone,
            twoTone: input.postflopHints.texture.twoTone,
            wetness: round2(input.postflopHints.texture.wetness),
            connectedness: round2(input.postflopHints.texture.connectedness),
            isAceHigh: input.postflopHints.texture.isAceHigh,
            hasFlushDraw: input.postflopHints.texture.hasFlushDraw,
            hasOpenEnder: input.postflopHints.texture.hasOpenEnder,
          },
          sprValue: round2(input.postflopHints.sprValue),
          sprBucket: input.postflopHints.sprBucket,
          valueSizingFraction: round2(input.postflopHints.valueSizingFraction),
          bluffSizingFraction: round2(input.postflopHints.bluffSizingFraction),
          sizingHintChips: input.postflopHints.sizingHintChips,
          valueRangeStrength: input.postflopHints.valueRangeStrength,
        }
      : null,
    instruction:
      "Choose the single best action. Honor risk profile, tilt flags, and the commit flag. " +
      "If preflop and a clean preflopHint is provided with confidence >= 80, default to it unless reads strongly say otherwise. " +
      "Output strict JSON only.",
  };

  const userText = JSON.stringify(userPayload);
  return {
    system: SYSTEM_PROMPT,
    user: userText,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
