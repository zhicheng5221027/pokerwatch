# PokerWatch — Implementation Plan

**Stack**: Vite 5 + React 18 + TypeScript + Tailwind + shadcn/ui · Zustand state · Comlink Web Worker for equity · Supabase Postgres + Edge Function · OpenAI gpt-5.5 · Vercel SPA hosting.

**Repos**: monorepo-friendly, standalone folder `pokerwatch/`. Will get its own GitHub repo.

**Supabase project**: `tstbiifukjstepgscmki` (https://tstbiifukjstepgscmki.supabase.co)

**Cost philosophy**: see PRD §10. T0–T1 are free local. T2–T3 (LLM) are last-resort, cropped, cached.

---

## 1. Folder layout

```
pokerwatch/
├── docs/
│   ├── prd-pokerwatch.md
│   ├── plan-pokerwatch.md
│   └── strategy-foundations.md
├── public/
│   ├── favicon.svg
│   └── platforms/stake-us/cards/   # 52 card sprite PNGs for template matching
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── overlay/
│   │   │   ├── HudCard.tsx           # the big action recommendation card
│   │   │   ├── EquityRow.tsx         # equity %, pot odds, MDF
│   │   │   ├── ActionStrip.tsx       # current-hand action history
│   │   │   ├── BoardStrip.tsx        # community cards visualization
│   │   │   ├── HoleCards.tsx         # hero hole cards
│   │   │   └── BankrollPill.tsx      # green/yellow/red bankroll badge
│   │   ├── side/
│   │   │   ├── HandLog.tsx
│   │   │   ├── SessionStats.tsx
│   │   │   ├── OpponentsPanel.tsx
│   │   │   └── TiltBanner.tsx
│   │   ├── settings/
│   │   │   └── SettingsDrawer.tsx
│   │   └── ui/                       # shadcn primitives
│   ├── pages/
│   │   ├── Index.tsx                 # the live overlay
│   │   ├── Sessions.tsx              # past sessions list
│   │   ├── SessionDetail.tsx         # one session deep dive
│   │   └── NotFound.tsx
│   ├── hooks/
│   │   ├── useScreenCapture.ts       # getDisplayMedia + frame loop
│   │   ├── useFrameGate.ts           # T0 perceptual hash gate
│   │   └── useSession.ts
│   ├── engine/                        # ALL local poker logic — pure TS
│   │   ├── cards.ts
│   │   ├── preflop/
│   │   │   ├── ranges.ts             # RFI/3bet/4bet/call ranges JSON
│   │   │   ├── pushFold.ts           # Nash short-stack tables
│   │   │   └── decide.ts             # local-only preflop decision
│   │   ├── postflop/
│   │   │   ├── textures.ts
│   │   │   ├── sizing.ts
│   │   │   └── decide.ts             # composes prompt + odds for AI
│   │   ├── odds.ts                   # pot odds, MDF, implied odds
│   │   ├── equity.worker.ts          # Comlink-exposed Monte Carlo
│   │   ├── spr.ts                    # SPR + commitment flag
│   │   ├── profile.ts                # opponent VPIP/PFR/AF roll-up
│   │   ├── tilt.ts                   # tilt detector
│   │   ├── bankroll.ts               # stake-level recommender + stop-loss
│   │   ├── journal.ts
│   │   └── aiPrompt.ts               # composes strategy AI prompt
│   ├── vision/                        # T1 + T2 pipeline
│   │   ├── frameHash.ts              # dHash perceptual hash (T0)
│   │   ├── platforms/
│   │   │   ├── stakeUs.ts            # ROI map for Stake.us NLHE table
│   │   │   └── generic.ts            # fallback ROIs
│   │   ├── cardTemplates.ts          # template-match against sprite library
│   │   ├── ocrStacks.ts              # tesseract.js wrapped ROI OCR
│   │   ├── extractLocal.ts           # T1 orchestrator → partial GameState
│   │   └── llmRepair.ts              # T2: call edge fn with cropped ROIs
│   ├── store/
│   │   ├── settings.ts               # Zustand persisted settings
│   │   ├── session.ts                # current session state
│   │   └── handlog.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── deviceId.ts               # localStorage anon id
│   │   └── format.ts
│   └── types/
│       ├── game.ts                   # GameState, Recommendation, Card, Seat
│       └── db.ts                     # generated Supabase types
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20260506000001_init.sql
│   ├── seed.sql
│   └── functions/
│       ├── analyze-poker/index.ts    # T2 vision repair + T3 strategy
│       └── _shared/cors.ts
├── .env.example
├── .gitignore
├── components.json
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vercel.json
└── vite.config.ts
```

## 2. Capture & loop

```
useScreenCapture (in Index.tsx)
  └─ every 2.5s ──> captureFrame() → ImageBitmap
        ├─ T0: useFrameGate.shouldProcess(bitmap) → bool
        │     - dHash(bitmap) vs prev; if Hamming distance < threshold ⇒ skip
        ├─ T1: vision/extractLocal(bitmap, platform)
        │     - templateMatch(holeCardROIs)
        │     - templateMatch(boardROIs)
        │     - tesseract on stack/pot ROIs
        │     - returns Partial<GameState> + missingFields[]
        ├─ if missingFields.length > 0:
        │     T2: vision/llmRepair(bitmap, missingFields)  ← Edge fn
        │        - sends only the cropped ROIs as JPEG dataURLs
        │        - returns the missing fields only
        ├─ merge → GameState (full)
        ├─ engine.handBoundary.detect(prev, curr) → bool
        │     - if true: close prior hand, persist, start new
        ├─ if !myTurn:
        │     - update HUD with "Watching" state, do nothing else
        ├─ engine.preflop.decide() if street=preflop and not raised yet OR
        │  facing one bet under cap conditions ⇒ pure local, return Recommendation
        ├─ else (postflop or complex preflop):
        │     T3: edge fn analyze-poker w/ {gameState, recentHands, profile, oddsHints}
        │        - cache key = sig(boardHash, position, stackBucket, actionHistHash)
        │        - returns Recommendation
        └─ store.recommendation = recommendation; render HUD
```

## 3. Database schema (one migration)

```sql
-- 20260506000001_init.sql
-- Drop & recreate clean
DROP TABLE IF EXISTS public.frame_cache CASCADE;
DROP TABLE IF EXISTS public.strategy_cache CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.hands CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;

CREATE TABLE public.settings (
  user_id text PRIMARY KEY,
  hero_name text,
  platform text DEFAULT 'stake.us',
  capture_interval_ms int DEFAULT 2500,
  risk_profile text DEFAULT 'standard',
  ai_model text DEFAULT 'gpt-5.5',
  bankroll_chips numeric DEFAULT 0,
  keep_history boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  platform text DEFAULT 'stake.us',
  stake_label text,
  hands_played int DEFAULT 0,
  net_chips numeric DEFAULT 0,
  ai_calls_t2 int DEFAULT 0,
  ai_calls_t3 int DEFAULT 0,
  estimated_cost_usd numeric DEFAULT 0,
  notes text,
  journal jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  hand_number int NOT NULL,
  table_hand_id text,
  street_reached text,
  hole_cards text[],
  board text[],
  position text,
  pot_final numeric,
  recommendation jsonb,
  game_state_snapshot jsonb,
  my_action text,
  result_chips numeric,
  followed_recommendation boolean,
  duration_seconds int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  seat_num int NOT NULL,
  screen_name text,
  hands_seen int DEFAULT 0,
  vpip_count int DEFAULT 0,
  pfr_count int DEFAULT 0,
  agg_actions int DEFAULT 0,
  passive_actions int DEFAULT 0,
  last_stack numeric,
  notes text,
  UNIQUE (session_id, seat_num)
);

CREATE TABLE public.frame_cache (
  frame_hash text PRIMARY KEY,
  game_state_partial jsonb,
  hits int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.strategy_cache (
  spot_signature text PRIMARY KEY,
  recommendation jsonb,
  hits int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_hands_session ON public.hands(session_id);
CREATE INDEX idx_players_session ON public.players(session_id);
CREATE INDEX idx_sessions_user ON public.sessions(user_id);

-- RLS — anon scoped by header x-user-id
ALTER TABLE public.settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hands      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frame_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_cache ENABLE ROW LEVEL SECURITY;

-- For v1, anon read/write; we scope by user_id at the application layer.
CREATE POLICY "anon all"   ON public.settings   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.sessions   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.hands      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.players    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon read"  ON public.frame_cache    FOR SELECT TO anon USING (true);
CREATE POLICY "anon write" ON public.frame_cache    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read"  ON public.strategy_cache FOR SELECT TO anon USING (true);
CREATE POLICY "anon write" ON public.strategy_cache FOR INSERT TO anon WITH CHECK (true);
```

Seed: a single example session + 3 example hands so the dashboard isn't empty on first load.

## 4. Edge function `analyze-poker`

Single function, two routes via `mode` field in body:
- `mode: "vision-repair"` → input: `{ crops: { fieldName: dataUrl }[], context }` → output: `{ fields: { hole_cards: [...], board: [...], pot: 1234, ... } }`. Uses gpt-5.5 vision.
- `mode: "strategy"` → input: `{ gameState, recentHands, profile, oddsHints, riskProfile }` → output: `Recommendation`. Uses gpt-5.5 chat.

Both routes:
- Read OpenAI key from env `OPENAI_API_KEY` (set in Supabase secrets).
- Hit the `strategy_cache` / nothing for vision (T2 cache is the local frame_cache table).
- CORS headers from `_shared/cors.ts`.
- Cost accounting: write incremented `ai_calls_t2` / `ai_calls_t3` on the session.

## 5. Strategy prompt (composed in `engine/aiPrompt.ts`)

```
SYSTEM: You are PokerWatch, a No-Limit Hold'em coach. You receive structured
game state and pre-computed math. You DO NOT recompute math; you use it.
Respond with strict JSON: { action, sizing?, reasoning, alternatives?, confidence }.
Honor the user's risk profile and the strategy foundations cheat-sheet below.

CHEATSHEET:
- Position over cards. Pot control. Fold equity is currency.
- Bankroll-protect: never recommend committing > 1 buy-in on tilt.
- Use SPR: low ⇒ commit with TPGK+, mid ⇒ pot-control marginals, high ⇒ big-hand poker.
- Sizing tiers: 25–33 dry/range, 50–66 std, 75–100 polar wet, overbets only with nut adv.
- vs calling station: thin value, almost no bluffs.
- vs nit: bluff more, fold to aggression.
- Tilt risk flagged ⇒ bias to fold/check-call.

GAME STATE: {GameState JSON}
PRE-COMPUTED MATH: { potOdds, mdf, sprBucket, equityVsRange, commitFlag, preflopChartHint }
OPPONENT: { vpip, pfr, af, label }
RECENT HANDS (for flow): [{ ... }, ...]  // ≤ 10
RISK PROFILE: tight | standard | loose
TILT FLAGS: [...]

DECIDE.
```

## 6. Milestones

| # | Goal | Deliverable | Owner |
|---|---|---|---|
| M1 | PRD + plan + strategy doc | This branch | me |
| M2 | Scaffold project | Vite skeleton runs locally | me + subagent A |
| M3 | Local engine (no AI) | preflop, odds, spr, profile, tilt, bankroll all unit-tested | subagent B |
| M4 | Vision pipeline T0+T1 | dHash gate + tesseract OCR + card template matching on Stake.us | subagent C |
| M5 | Edge function | analyze-poker live in Supabase, both modes work | subagent D |
| M6 | Overlay UI | HudCard + side rail + settings drawer wired to store | subagent E |
| M7 | Integration | full loop: capture → extract → decide → render | me |
| M8 | DB + Vercel deploy | migration applied, site live on Vercel preview, env vars set | me |
| M9 | Smoke test on screenshot | run against the user-supplied Stake.us screenshot, verify pipeline | me |

## 7. Subagent dispatch matrix (parallelizable)

After scaffold (M2) is done, M3/M4/M5/M6 are largely independent. We dispatch them as a single message with multiple Agent calls.

- **A — Scaffolder** (sequential, do first): create package.json, tailwind, shadcn config, supabase client, env wiring, vite config, vercel.json, base App.tsx with routes.
- **B — Engine author**: write `src/engine/**` end-to-end with vitest unit tests.
- **C — Vision author**: write `src/vision/**` + Stake.us ROI map + tesseract.js worker.
- **D — Edge fn author**: write `supabase/functions/analyze-poker/index.ts` + migration + seed.
- **E — UI author**: write `src/components/overlay/**` + `src/components/side/**` + `src/pages/Index.tsx` (using engine + vision interfaces stubbed if needed).

Each subagent is given:
- This plan doc + strategy-foundations doc as context.
- Their slice of the file layout above.
- Strict instructions: no broad refactors, only their files; types live in `src/types/`.

## 8. Verification checklist (M9)

- [ ] `npm run dev` boots, no console errors.
- [ ] `npm run build` succeeds, output dir present.
- [ ] Drop the user-supplied Stake.us screenshot into a `tests/fixtures` and run `npm run test:vision` — extracts seats and labels with ≥80% confidence (no hole cards in this empty-table screenshot; that's expected).
- [ ] Engine unit tests green (preflop chart hits the right buckets, pot odds match by-hand calc, SPR commit flag fires correctly).
- [ ] Edge function deployed; `curl` smoke test for both modes returns 200.
- [ ] Migration applied to `tstbiifukjstepgscmki`; tables list matches schema; seed row present.
- [ ] Vercel build green; site loads; settings persist; `Start watching` opens the picker.
- [ ] Cost telemetry on the session row increments correctly (mocked T2/T3 calls).

## 9. Non-negotiables

- The OpenAI key never reaches the browser bundle. Always edge-function-proxied.
- The browser never automates clicks. The overlay only displays.
- No tracking beyond the user's own anonymous device id.
- The strategy AI is grounded in pre-computed math (we trust the calculator, not the model).
- Every recommendation is logged with the exact GameState that produced it — auditability.
