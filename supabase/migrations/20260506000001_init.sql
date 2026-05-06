-- 20260506000001_init.sql
-- PokerWatch initial schema. Idempotent: drops first, then recreates.

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
ALTER TABLE public.settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frame_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_cache ENABLE ROW LEVEL SECURITY;

-- For v1, anon read/write; we scope by user_id at the application layer.
CREATE POLICY "anon all"   ON public.settings       FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.sessions       FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.hands          FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon all"   ON public.players        FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon read"  ON public.frame_cache    FOR SELECT TO anon USING (true);
CREATE POLICY "anon write" ON public.frame_cache    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read"  ON public.strategy_cache FOR SELECT TO anon USING (true);
CREATE POLICY "anon write" ON public.strategy_cache FOR INSERT TO anon WITH CHECK (true);
