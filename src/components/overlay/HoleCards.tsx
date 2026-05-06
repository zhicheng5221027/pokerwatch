// Hero hole cards. Two slots; if missing, shows "—".
import type { Card as PCard } from "@/types/game";
import { holeToCode } from "@/engine/cards";
import { cn } from "@/lib/utils";

interface Props {
  cards: PCard[] | undefined;
  className?: string;
}

const SUIT_GLYPH: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

const SUIT_COLOR: Record<string, string> = {
  s: "text-foreground",
  c: "text-foreground",
  h: "text-rose-400",
  d: "text-sky-400",
};

interface FaceProps {
  card?: PCard;
}

function Face({ card }: FaceProps) {
  if (!card) {
    return (
      <div
        className="flex h-20 w-14 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground/60"
        aria-label="Hole card empty"
      >
        —
      </div>
    );
  }
  const rank = card[0];
  const suit = card[1];
  return (
    <div
      className="flex h-20 w-14 flex-col items-center justify-center rounded-md border border-border bg-card shadow"
      aria-label={`Hole card ${rank}${SUIT_GLYPH[suit] ?? suit}`}
    >
      <span className="font-mono text-2xl font-bold leading-none">{rank}</span>
      <span className={cn("mt-1 text-lg leading-none", SUIT_COLOR[suit])}>
        {SUIT_GLYPH[suit] ?? suit}
      </span>
    </div>
  );
}

export function HoleCards({ cards, className }: Props) {
  const c = cards ?? [];
  let code: string | null = null;
  if (c.length === 2) {
    try {
      code = holeToCode(c);
    } catch {
      code = null;
    }
  }
  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          you
        </span>
        {code && (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {code}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Face card={c[0]} />
        <Face card={c[1]} />
      </div>
    </div>
  );
}
