# PokerWatch — Strategy Foundations

> The poker theory PokerWatch encodes. Used both as (a) the local decision engine for cheap/common spots and (b) the system prompt the strategy AI is grounded in. This is your training manual too.

## 0. The long-game compass

Poker is a series of small, +EV decisions across thousands of hands. You can play perfectly and lose tonight. You can play badly and win tonight. **The only thing in your control is decision quality, not results.** PokerWatch measures both.

Three rules that beat almost everyone at micro-stakes:

1. **Position over cards.** Play more hands when you act last (BTN, CO), far fewer when you act first (UTG, EP).
2. **Pot control.** Big pots want big hands. Don't bloat with one pair; don't slow-play monsters out of position.
3. **Fold equity is real currency.** A bet that *can* win the pot uncontested is worth more than a bet that only wins at showdown.

## 1. Bankroll & game selection (the boring part that matters most)

Variance can put any winning player at -10 buyins. The bankroll rule is what stops one bad night from ending your career.

| Stake type | Min bankroll | Stop-loss per session | Stop-win |
|---|---|---|---|
| NLHE cash, full ring | **30 buy-ins** | 3 buy-ins | none (keep playing if A-game) |
| NLHE cash, 6-max | 40 buy-ins | 3 buy-ins | none |
| MTT regular speed | 100 buy-ins | n/a (one buy-in) | n/a |
| Spin/turbo | 200 buy-ins | n/a | n/a |

PokerWatch surfaces:
- Buy-in level the user is rolled for (green/yellow/red).
- A loud banner if user sits down at a table that's red.
- Stop-loss alarm at -3 buy-ins, with a "play one more orbit then leave" mode.

**Game selection** matters as much as bankroll: prefer tables where average pot is large and average VPIP > 35%. PokerWatch shows table-quality score on the table-list view (when a session is recorded with table list visible) and recommends leaving when score drops.

## 2. Preflop — ranges by position (100bb baseline)

Opening ranges (raise first in, ~2.5x):

| Position | RFI range | % of hands |
|---|---|---|
| UTG (9-max) | 88+, AJs+, KQs, AQo+ | ~10% |
| MP | 77+, ATs+, KJs+, QJs, AJo+, KQo | ~14% |
| CO | 55+, A8s+, K9s+, Q9s+, JTs, T9s, ATo+, KJo+, QJo | ~25% |
| BTN | 22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, K9o+, Q9o+, J9o+, T9o | ~45% |
| SB (no limp) | 22+, A2s+, K7s+, Q9s+, J9s+, T9s, 98s, A9o+, KJo+, QJo | ~30% |
| BB (vs steal, defend) | very wide; per attacker pos × sizing | varies |

Versus a raise:
- **3bet for value**: QQ+, AK (always).
- **3bet bluffs (linear/IP)**: A5s, A4s (blockers).
- **3bet bluffs (polar/OOP)**: blocker hands like KQs, A5s, A4s; mix.
- **Cold call**: rarely OOP; often IP on BTN with 22-99, AQs, KQs, suited connectors.

Versus a 3bet:
- **4bet for value**: KK+, AKs (always); JJ/AKo as mix.
- **4bet bluffs**: A5s, A4s (blocker).
- **Call**: rest of QQ-, broadways, suited connectors when deep IP.

Short-stack (≤15bb) preflop = push-fold from a table; PokerWatch uses Nash push-fold ranges by position.

## 3. Postflop — the four-question framework

Every street, before clicking, the engine answers in order:

1. **Whose range is this board good for?** Compare hero range vs villain's expected range against the board texture. Range advantage drives whether to bet at all.
2. **What's the SPR?** SPR = effective stack ÷ pot. Low (≤4) = commit with top pair+; medium (4–13) = be careful with one pair; high (>13) = play big-hand poker, avoid bloat with marginal holdings.
3. **What does my hand do well?**
   - Made hand → bet for value if worse hands call.
   - Draws → bet for fold equity + equity realization, or check-call with right odds.
   - Air → bluff only with blockers and clear fold-equity story.
4. **What's villain's likely response?** Tight-passive = thin value, fewer bluffs. Loose-aggressive = pot-control marginals, trap with strong.

### 3.1 Board textures

| Texture | Examples | Hero IP c-bet (vs single caller) |
|---|---|---|
| Dry, ace-high | A♠ 7♥ 2♣ | Small (25–33%) frequently — range bet |
| Dry, low/middle | 8♣ 5♦ 2♠ | Mixed; small bet works against passive |
| Two-tone, connected | 9♥ 8♥ 6♣ | Polarize: bigger (66–75%) with strong+bluffs |
| Monotone | K♥ 9♥ 4♥ | Cautious; check more, bet large with nut FD or made flush |
| Paired | K♠ K♦ 4♣ | Small range bet; calling stations call too thin to bluff often |
| Broadway, dynamic | Q♠ J♥ T♦ | Check more OOP; villain has more sets/two-pair than hero |

### 3.2 Bet sizing tiers

- **Small (25–33%)**: range bets on dry boards, blocker bets on rivers, thin value.
- **Medium (50–66%)**: standard c-bet on most textures.
- **Large (75–100%)**: polarized — value-heavy or bluff-heavy on wet boards, big rivers.
- **Overbet (125–200%)**: only with nut advantage and on rivers / specific turn cards (the AI suggests these rarely in v1).

### 3.3 Pot odds, MDF, equity

- **Pot odds** = bet / (pot + bet + bet). Need at least this much equity to call.
- **MDF** (minimum defense freq) = pot / (pot + bet). Defend at least this fraction of your range or you're exploitable to bluffs.
- **Implied odds**: add expected future winnings when drawing in deep stacks.
- **Reverse implied odds**: subtract expected future losses when your hand is dominated (e.g., A-rag offsuit calling 3bets).

PokerWatch computes all three locally on every decision and shows them in the HUD.

### 3.4 Commitment thresholds (when to never fold)

If `chips_already_in_pot ≥ 0.33 × effective_stack` AND you have top pair + good kicker or better, you're typically committed. Folding equity-rich made hands here is the leak that destroys micro-stakes players. PokerWatch flags **COMMITTED** in red on the HUD when SPR analysis says fold = leak.

### 3.5 When to all-in

- **Stack ≤ 15bb**: push-fold (Nash) preflop.
- **Postflop, low SPR (≤3)** with top pair + decent kicker, two pair, sets, strong draws on flop: get it in.
- **Bluff shoves**: only on rivers with the right blocker + range advantage + ≥40% fold equity needed.
- **Never** all-in on tilt. PokerWatch's tilt detector (§5) suppresses shove recommendations after 2 consecutive flagged tilt indicators.

## 4. Reading opponents — the cheap profile

PokerWatch builds a 4-axis profile for every seen opponent:

- **VPIP** (% hands voluntarily entering pot): <20 = nit, 20–28 = reg, 28–38 = LAG, >38 = fish.
- **PFR** (% hands raising preflop): close to VPIP = aggressive, much lower = passive.
- **AF** (aggression factor on later streets): <1 = passive, 1–3 = balanced, >3 = maniac.
- **Showdown tendencies**: shows down weak holdings? Folds rivers too often?

These come from observed actions, no hands required. After ~30 hands the profile is meaningful.

Profile-based adjustments (PokerWatch applies these to the AI's strategy prompt):
- **Calling station** (VPIP high, AF low): value bet thinner, bluff almost never.
- **Nit** (VPIP <18): bluff more, fold to their aggression unless huge.
- **Maniac** (VPIP/PFR high, AF >3): trap more, call down lighter, expand value range.
- **TAG reg**: standard GTO-ish lines, lean to exploit only when sample is large.

## 5. Tilt detection (the silent bankroll killer)

Indicators (rolling 30-hand window):
- VPIP > user's 90th-percentile baseline.
- Aggression frequency > user's baseline + 2σ.
- Average decision time < 2s (auto-piloting).
- Calling 3bets with hands outside the chart 3+ times in window.
- Open-raising from EP with hands not in EP range 2+ times.

When 2+ indicators trip:
- HUD shows a soft yellow "Tilt risk: ..." chip.
- Strategy AI is informed and biases toward fold and check-call.
- After 3 indicators or a -2 buy-in delta in <30 hands: hard banner suggesting a 5-min break.

## 6. The session loop (how to actually win the long game)

Every session, PokerWatch enforces this loop:

1. **Pre-session**: bankroll check, sleep/state self-rating, target hands, stop-loss preset.
2. **In-session**: real-time HUD per hand. Hand log auto-saved.
3. **End-of-session**: review screen — biggest 5 wins, biggest 5 losses, hands where user diverged from recommendation, opponent table summary.
4. **Post-session**: 3-question journal — "what did I learn / what was my biggest mistake / one thing to do next time." Stored on session row.
5. **Weekly**: dashboard shows BB/100, recommendation-followed %, recommendation-followed BB/100 vs unfollowed, tilt incidents.

If recommendation-followed BB/100 is consistently better than unfollowed BB/100 across 2k+ hands → the coach is actually helping → trust it more. If not, something's wrong (bad model, bad ranges, ToS-flagged board reads, etc.) and we tune.

## 7. Encoded as data

This document maps to ship-able JSON / TS modules:

- `engine/preflop/ranges.ts` — RFI / 3bet / 4bet / call ranges by position, 100bb baseline, plus shorter-stack variants.
- `engine/preflop/pushFold.ts` — Nash push-fold tables for ≤15bb.
- `engine/postflop/textures.ts` — board classifier returning `{wetness, paired, monotone, twoTone, connectedness, highCard}`.
- `engine/postflop/sizing.ts` — sizing tier picker based on texture + spot.
- `engine/odds.ts` — pot odds, MDF, implied odds.
- `engine/equity.ts` — Monte Carlo equity vs assumed range (Web Worker).
- `engine/spr.ts` — SPR + commitment threshold flags.
- `engine/profile.ts` — opponent profile builder + label.
- `engine/tilt.ts` — tilt detector.
- `engine/bankroll.ts` — buy-in level recommender + stop-loss watcher.
- `engine/journal/prompts.ts` — end-of-session journal prompts.
- `engine/aiPrompt.ts` — composes the strategy AI prompt from the above modules + the current GameState.

The strategy AI's job is **not** to do math (we do it locally and feed the numbers in), but to pick the action when multiple options are close in EV — using the heuristics above plus opponent reads.

## 8. What "good" looks like

- After 2k hands, user's BB/100 is positive when following the recommendation.
- Tilt incidents per session trend down over a month.
- Bankroll level rises (or holds steady at the right buy-in level).
- The user can articulate *why* a recommendation is what it is — because the HUD always tells them.
