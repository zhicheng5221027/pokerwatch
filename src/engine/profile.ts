// Opponent profile builder. Maps observed actions to VPIP/PFR/AF and a label.
// Strategy doc §4.

import type { ActionEvent, OpponentProfile } from "@/types/game";

/**
 * Build a profile for `seatNum` using all observed actions.
 *
 * Hand boundaries: VPIP/PFR are per-hand counters. We approximate hand
 * boundaries by clusters of preflop actions for a seat: each unique
 * "first preflop action" of a seat in a hand counts as one hand sample.
 * Since ActionEvent has no handId, we delimit hands by sequences where
 * the seat acts on preflop and then on later streets, with later events
 * eventually returning to preflop with no street regression in between.
 *
 * For our use case (live overlay), the caller passes a window of events
 * that already corresponds to a known set of hands. So we just count:
 *   - hands: number of distinct preflop "first actions" by this seat
 *   - VPIP: hands where first preflop action ∈ {call,bet,raise,all-in}
 *           (post-blinds don't count)
 *   - PFR:  hands where first preflop action ∈ {bet,raise,all-in}
 *   - AF:   (bets+raises) / (calls) on flop+turn+river streets
 */
export function buildProfile(
  seatNum: number,
  observed: ActionEvent[],
): OpponentProfile {
  // Sort all events by timestamp. We walk the global stream so we can use
  // street transitions as natural hand boundaries.
  const all = [...observed].sort((a, b) => a.timestamp - b.timestamp);

  let hands = 0;
  let vpipHands = 0;
  let pfrHands = 0;
  let aggCount = 0;
  let callCount = 0;

  // Hand-boundary detection: a new hand begins on a preflop event for THIS
  // seat when either
  //   (a) it's the first such event we've seen, OR
  //   (b) we've seen any non-preflop event since the seat's last preflop
  //       action (i.e., a street has advanced for ANY seat), OR
  //   (c) the seat's last preflop action was a fold (folds end the hand).
  //
  // This handles the common cases:
  //   - hands the seat folds preflop (b/c flop is dealt for the table → (b))
  //   - hands the seat plays multiple preflop actions (3-bet, call) within a
  //     single hand (none of the conditions trigger → grouped as 1 hand).
  let firstPreflopThisHand: ActionEvent["verb"] | null = null;
  let lastSeatPreflopVerb: ActionEvent["verb"] | null = null;
  let sawNonPreflopSinceSeatPreflop = false;
  let seatHasActedThisHand = false;

  const closeHand = () => {
    if (firstPreflopThisHand !== null) {
      hands++;
      const v = firstPreflopThisHand;
      const isVoluntary =
        v === "call" || v === "bet" || v === "raise" || v === "all-in";
      const isPfr = v === "bet" || v === "raise" || v === "all-in";
      if (isVoluntary) vpipHands++;
      if (isPfr) pfrHands++;
    }
    firstPreflopThisHand = null;
    seatHasActedThisHand = false;
  };

  for (const e of all) {
    const isThisSeat = e.seatNum === seatNum;

    if (e.street === "preflop") {
      if (isThisSeat) {
        const blind =
          e.verb === "post-sb" ||
          e.verb === "post-bb" ||
          e.verb === "post-ante";
        const startsNewHand =
          !seatHasActedThisHand ||
          sawNonPreflopSinceSeatPreflop ||
          lastSeatPreflopVerb === "fold";
        if (startsNewHand) {
          closeHand();
          sawNonPreflopSinceSeatPreflop = false;
        }
        seatHasActedThisHand = true;
        if (!blind && firstPreflopThisHand === null) {
          firstPreflopThisHand = e.verb;
        }
        lastSeatPreflopVerb = e.verb;
      }
    } else if (
      e.street === "flop" ||
      e.street === "turn" ||
      e.street === "river"
    ) {
      // Any non-preflop event by anyone signals a new street has begun.
      sawNonPreflopSinceSeatPreflop = true;
      if (isThisSeat) {
        if (e.verb === "bet" || e.verb === "raise") aggCount++;
        else if (e.verb === "call") callCount++;
        // folds and checks don't move AF.
      }
    }
  }
  closeHand();

  const vpip = hands > 0 ? (vpipHands / hands) * 100 : 0;
  const pfr = hands > 0 ? (pfrHands / hands) * 100 : 0;
  const af = callCount > 0 ? aggCount / callCount : aggCount > 0 ? 99 : 0;

  return {
    seatNum,
    name: null,
    hands,
    vpip,
    pfr,
    af,
    label: classify(vpip, pfr, af, hands),
  };
}

/** Classification thresholds per strategy doc §4. */
function classify(
  vpip: number,
  pfr: number,
  af: number,
  hands: number,
): OpponentProfile["label"] {
  if (hands < 8) return "unknown";
  if (vpip < 18) return "nit";
  if (vpip > 38 && af < 1) return "calling-station";
  if (vpip > 38) return "fish";
  if (vpip >= 28 && af > 3) return "maniac";
  if (vpip >= 28) return "LAG";
  if (pfr >= vpip - 5 && vpip <= 28) return "TAG";
  return "TAG";
}
