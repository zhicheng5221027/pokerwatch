-- PokerWatch seed: one demo session + 3 demo hands so the dashboard isn't empty.
-- Uses fixed user_id = 'seed-user'.

insert into public.settings (user_id, hero_name, platform) values
  ('seed-user', 'Hero', 'stake.us')
on conflict (user_id) do nothing;

-- one demo session + 3 hands attached to it
with s as (
  insert into public.sessions (user_id, started_at, ended_at, platform, stake_label, hands_played, net_chips)
  values ('seed-user', now() - interval '2 hours', now() - interval '1 hour', 'stake.us', 'NLHE 100/200 GC', 3, 1450)
  returning id
)
insert into public.hands (
  session_id, hand_number, street_reached, hole_cards, board, position, pot_final,
  recommendation, my_action, result_chips, followed_recommendation
)
select
  s.id,
  n,
  'flop',
  ARRAY['As','Kh'],
  ARRAY['Ad','7s','2c'],
  'BTN',
  800,
  jsonb_build_object(
    'action', 'raise',
    'sizing', 400,
    'reasoning', 'Top pair good kicker on dry ace-high',
    'confidence', 82,
    'source', 'ai-strategy'
  ),
  'raise',
  600,
  true
from s, generate_series(1, 3) n;
