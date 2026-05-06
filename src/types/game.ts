// Shared types — used by engine, vision, UI, and the edge function.
// Cards are 2-char strings: rank + suit. e.g. "As", "Td", "9c", "2h".
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Suit = "s" | "h" | "d" | "c";
export type Card = `${Rank}${Suit}`;

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "between";
export type Position = "UTG" | "UTG1" | "MP" | "MP1" | "HJ" | "CO" | "BTN" | "SB" | "BB";
export type ActionVerb = "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "post-sb" | "post-bb" | "post-ante";

export interface Seat {
  seatNum: number;
  name: string | null;
  stack: number;
  inHand: boolean;
  hasActed: boolean;
  lastAction: ActionVerb | null;
  isHero: boolean;
  isDealer: boolean;
}

export interface ActionEvent {
  street: Street;
  seatNum: number;
  verb: ActionVerb;
  amount?: number;
  timestamp: number;
}

export interface GameState {
  platform: string;
  tableId: string | null;
  blinds: { sb: number; bb: number };
  ante: number;
  stakeCurrency: string; // "GC" | "SC" | "USD" | "chips"
  street: Street;
  pot: number;
  toCall: number;
  board: Card[];
  myHole: Card[];
  mySeat: number | null;
  myStack: number;
  seats: Seat[];
  actionOnSeat: number | null;
  myTurn: boolean;
  actionHistory: ActionEvent[];
  /** 0..1 self-reported by the extractor (T1 + T2 merged). */
  confidence: number;
  capturedAt: number;
}

export type Action = "fold" | "check" | "call" | "raise" | "all-in" | "wait";

export interface Recommendation {
  action: Action;
  /** Chips. Only meaningful when action === "raise". */
  sizing?: number;
  reasoning: string;
  confidence: number; // 0..100
  equityVsRange?: number; // 0..100
  potOdds?: number; // 0..100
  mdf?: number; // 0..100
  spr?: number;
  committed?: boolean;
  alternatives?: Array<{ action: Action; sizing?: number; weight: number }>;
  source: "preflop-chart" | "ai-strategy" | "fallback";
}

export interface OpponentProfile {
  seatNum: number;
  name: string | null;
  hands: number;
  vpip: number; // 0..100
  pfr: number; // 0..100
  af: number; // ratio
  label: "calling-station" | "nit" | "TAG" | "LAG" | "maniac" | "fish" | "unknown";
}

export interface TiltState {
  flags: string[]; // e.g. ["vpip-spike","auto-pilot"]
  level: 0 | 1 | 2 | 3; // 0 fine, 3 strong recommend break
}

export interface BankrollStatus {
  bankrollChips: number;
  buyInChips: number; // current table BB * 100 (default)
  buyInsHeld: number;
  level: "green" | "yellow" | "red";
}

export interface SessionStats {
  hands: number;
  netChips: number;
  bbPer100: number;
  followedRecHands: number;
  followedRecNet: number;
  unfollowedRecHands: number;
  unfollowedRecNet: number;
  biggestPotWon: number;
  biggestPotLost: number;
}
