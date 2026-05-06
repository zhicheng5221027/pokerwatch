# PRD — PokerWatch

> Real-time poker study & decision overlay. Watches a screen-shared poker table, reads the game state with vision AI, and surfaces a recommended action, equity / pot-odds / opponent reads, and session-level results.

## 1. Problem & vision

You're learning No-Limit Texas Hold'em on Stake.us (Gold Coins / Sweeps Cash). You want a coach that:

- Looks at the same screen you do, every few seconds.
- Tells you what to do this street: **fold / check / call / raise (size)** with a one-line *why* and a confidence score.
- Tracks every hand it sees so you can review wins, losses, leaks, and longer-term trends.
- Stays out of the way visually — small HUD, dense info, no flicker.

It is a **study tool**, not a bot. PokerWatch never clicks for you. You always make the move yourself; the overlay just reasons aloud.

## 2. Compliance & ethics (read first)

- **Site ToS**: most poker sites prohibit real-time assistance / HUDs / solvers during play. Stake.us is no exception. Running PokerWatch on real Sweeps Cash games is at your own risk and may get an account banned. Default-safe usage = **Gold Coins (play money) tables, or hand-history review after the fact.**
- **Observe-only by default**: PokerWatch never reads memory, never injects scripts into the poker page, and never automates input. It only ever sees the screen frames you choose to share.
- **Local-first storage option**: every hand is yours. Cloud sync is opt-in.
- **Honest accuracy numbers**: the AI's confidence is shown alongside every recommendation. We will surface real win-rate vs. recommendation-followed numbers in the dashboard so the user can see whether the coach is actually helping.

## 3. Users & primary use cases

**Primary user**: a solo player learning NLHE on Stake.us, eventually portable to other platforms (PokerStars, ACR, GGPoker, ClubGG, generic web tables).

**Use cases**:

1. **Live coach** — table is open in another window/tab; PokerWatch sits beside it and tells the user what the right play is.
2. **Replay coach** — user shares a recorded session (or an opened hand replay) and PokerWatch annotates each decision.
3. **Session journal** — at end of session, user sees: hands played, VPIP/PFR estimate, biggest pot won, biggest pot lost, recommended-vs-actual divergence, net chip delta.

## 4. Core features (v1 scope)

### 4.1 Screen capture
- One-click `Start watching` → browser `getDisplayMedia` prompt → user picks the poker tab/window.
- Configurable polling interval (default **2.5s**, range 1–10s).
- Captures a downsampled JPEG (longest side ≤ 1024px, quality 0.7) to keep tokens cheap.
- Auto-pauses when no table detected for N consecutive frames.

### 4.2 Vision → game state (hybrid pipeline; see §10)
- Edge function `analyze-poker` is the **last resort**, not the first. The pipeline tries cheap deterministic methods first and only escalates to the LLM when those fail or the situation is non-trivial.
- **Stage 1 (local, free)**: perceptual-hash the new frame against the previous one. If unchanged → skip everything, the recommendation is still valid. Drops most idle frames.
- **Stage 2 (local, free)**: pixel-template card recognition + tesseract.js OCR for stacks/pot/blinds. Hits >90% on a known platform layout (Stake.us). Yields a partial `GameState`.
- **Stage 3 (AI, vision)**: only when local extraction has missing or low-confidence fields, call OpenAI `gpt-5.5` vision with **only the cropped ROI(s) we couldn't read** (not the whole frame). Returns the missing fields.
- **Stage 4 (AI, strategy — postflop only)**: feed the merged `GameState` + last N hands + user profile to `gpt-5.5` for the `Recommendation`. **Preflop spots skip Stage 4 entirely** and use the local preflop chart.
- `GameState` schema (extracted by vision):
  - `tableId, blinds {sb, bb}, ante, stakeCurrency`
  - `street: "preflop" | "flop" | "turn" | "river" | "showdown" | "between"`
  - `pot`, `toCall`
  - `board: Card[]` (0–5)
  - `mySeat`, `myStack`, `myHole: Card[]` (0–2)
  - `seats: Seat[]` — `{seatNum, name, stack, inHand, hasActed, lastAction, isHero, isDealer}`
  - `actionOnSeat`, `myTurn: boolean`
  - `confidence: number`
- `Recommendation` schema:
  - `action: "fold" | "check" | "call" | "raise" | "all-in" | "wait"`
  - `sizing?: number` (chips, only for raise)
  - `reasoning: string` (≤ 200 chars)
  - `equityVsRange?: number` (0–100, post-flop)
  - `potOdds?: number` (0–100)
  - `confidence: number`
  - `alternatives: {action, sizing?, weight}[]` (mixed strategy when relevant)

### 4.3 Identifying "you"
- Settings field: **`heroName`** (the player's screen name). Vision is told to find the seat whose label matches.
- Fallback heuristic: hero seat is the one where hole cards are face-up.
- Manual override: user can click any seat in the HUD to mark "this is me."

### 4.4 Overlay UI
- Compact, always-visible HUD card with:
  - Big action button label: **CALL / FOLD / RAISE 350** (no actual click — display only).
  - Confidence pill (0–100%).
  - One-line reasoning.
  - Equity %, pot odds %, pot size, to-call.
  - 5-state action history strip for current hand.
- Side rail (collapsible):
  - Hand log (last 50 hands, click to view full reasoning).
  - Session stats: hands, win/loss, biggest pot, BB/100 estimate, recommendation-followed %.
  - Opponents panel: per-seat VPIP/PFR estimates, last-seen action, stack delta.
- Settings drawer:
  - heroName, platform preset (Stake.us / generic), capture interval, AI model, risk dial (tight/standard/loose), keep-history toggle.

### 4.5 Session tracking
- A session starts when watching begins, ends on stop.
- Every detected hand is logged: hole cards, board, action history, recommendation, my action (best-effort inferred from next-frame state), result (won/lost amount).
- Net chip delta computed from `myStack` deltas across hand boundaries.
- Dashboard page lists past sessions and aggregates lifetime stats.

### 4.6 Game planning & strategy
- Built-in **preflop charts** (open-raise / 3bet / call ranges by position, 100bb deep).
- Built-in **pot-odds + implied-odds calculator** used to sanity-check the strategy AI.
- Built-in **basic equity estimator** (Monte Carlo, ~2k trials, runs in a Web Worker) for post-flop spots.
- Strategy AI prompt is templated with: heroName, position, stack depth in BBs, board texture flags, opponent profile (VPIP / aggression bucket).

## 5. Non-goals (v1)

- No automation / clicking / hotkeys / mouse control.
- No multi-tabling solver-level GTO output (we approximate).
- No mobile (uses screen-share APIs that work best on desktop Chrome/Edge).
- No real-money compliance integrations.
- No leak-finder or coaching reports beyond raw session stats — that's v2.

## 6. Tech stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui (mirrors the visual-test-helper reference). State via Zustand. Equity worker via Comlink.
- **Backend**: Supabase Postgres + Edge Functions (Deno). Edge function `analyze-poker` calls the AI gateway.
- **AI**:
  - Vision extract: OpenAI `gpt-5.5` (multimodal, structured-output mode → GameState JSON).
  - Strategy: OpenAI `gpt-5.5` (single model handles both stages; stage 1 = vision JSON, stage 2 = chat-completion with prior hands as context).
  - Key lives only on the server (Supabase Edge Function env var `OPENAI_API_KEY`); the browser never sees it.
- **Hosting**: Vercel (static SPA build).
- **DB**: Supabase project `tstbiifukjstepgscmki`.

## 7. Data model

```sql
sessions (
  id uuid pk,
  user_id text,                -- anon device id for v1
  started_at timestamptz,
  ended_at timestamptz,
  platform text,               -- 'stake.us' | 'pokerstars' | 'generic'
  stake_label text,            -- e.g. 'NLHE 100/200 GC'
  hands_played int default 0,
  net_chips numeric default 0,
  notes text
)

hands (
  id uuid pk,
  session_id uuid fk,
  hand_number int,             -- per session
  table_hand_id text,          -- if scraped from screen
  street_reached text,
  hole_cards text[],           -- ['As','Kd']
  board text[],
  position text,               -- 'BTN','SB','BB','UTG',...
  pot_final numeric,
  recommendation jsonb,        -- full Recommendation object
  game_state_snapshot jsonb,   -- last GameState seen for this hand
  my_action text,
  result_chips numeric,        -- delta to my stack
  duration_seconds int,
  created_at timestamptz default now()
)

players (
  id uuid pk,
  session_id uuid fk,
  seat_num int,
  screen_name text,
  hands_seen int default 0,
  vpip_count int default 0,
  pfr_count int default 0,
  last_stack numeric,
  notes text
)

settings (
  user_id text pk,
  hero_name text,
  platform text,
  capture_interval_ms int default 2500,
  risk_profile text default 'standard',  -- 'tight' | 'standard' | 'loose'
  ai_model text default 'gemini+claude',
  keep_history boolean default true,
  updated_at timestamptz default now()
)

frame_cache (
  id uuid pk,
  frame_hash text unique,      -- perceptual hash of input image
  game_state jsonb,
  recommendation jsonb,
  created_at timestamptz default now()
)
```

RLS: anon read/write to own `user_id` rows (via header `x-user-id`).

## 8. Open questions

- Do we want a Chrome extension wrapper later for true overlay-on-top? (v2)
- Should the strategy AI be allowed to suggest leaving a table (game selection)? (probably yes)
- Should session results show absolute chip delta or convert GC → "study points"? (default: chips, with GC label)

## 10. Cost-aware automation pipeline

The naive approach — "send every screenshot to a vision model" — would cost dollars per session and is wasteful (most frames are identical to the previous one). PokerWatch tiers the work:

| Tier | What runs | When | Cost |
|---|---|---|---|
| **T0 — Frame gate** | Perceptual hash compare to previous frame; activity score from pixel diff in pot/board ROIs | Every poll (~2.5s) | Free, ~5 ms |
| **T1 — Local extract** | Card template matching (52-card sprite library per platform), tesseract.js OCR for stacks/pot/blinds, simple seat-occupancy detector | Only if T0 says "frame changed" | Free, ~150 ms |
| **T2 — AI vision repair** | `gpt-5.5` vision call, sent only the cropped ROI(s) T1 couldn't read, prompted for strict JSON of just the missing fields | Only if T1 has missing/low-confidence fields | ~$0.001/call; expected 1–3× per hand |
| **T3 — AI strategy** | `gpt-5.5` chat call with merged GameState + last 10 hands + user profile + preflop-chart-suggested action as a hint | Only postflop, only when it's our turn, only if `(boardHash, positionHash, stackDepthBucket, actionHistoryHash)` cache miss | ~$0.003/call; expected 1–4× per hand |
| **L0 — Pure local** | Pot odds, MDF, basic equity (Monte Carlo Web Worker), VPIP/PFR roll-up, BB/100, session deltas, hand-boundary detection, preflop chart lookup | Always | Free |

Concrete budget targets:
- Idle (between hands) → **0 AI calls**.
- Preflop hand → **0–1** AI calls (only if vision repair needed for opponent stack reads).
- Postflop hand reaching showdown → **3–6** AI calls total across all streets.
- Target session cost (200 hands, mixed) → **≤ $1.50**.

Caches are persistent: `frame_cache` keyed by perceptual hash, `strategy_cache` keyed by spot signature. Cache writes are async / fire-and-forget so they don't block the UI.

## 9. Success metrics

- **Latency**: ≤ 3s from frame capture to recommendation rendered.
- **Vision accuracy**: ≥ 90% correct seat / hole-card / board extraction on Stake.us PokerVerse layout.
- **Cost**: ≤ $0.005 per hand on average (vision flash + strategy).
- **User outcome**: weekly check — does followed-recommendation play out-perform unfollowed plays in chip EV? (instrumented from day 1).
