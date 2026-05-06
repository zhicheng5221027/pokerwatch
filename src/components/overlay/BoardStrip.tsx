// Five card slots for the community board. Filled / empty visualization.
import type { Card as PCard } from "@/types/game";
import { cn } from "@/lib/utils";

interface Props {
  board: PCard[] | undefined;
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

interface SlotProps {
  card?: PCard;
  index: number;
}

function Slot({ card, index }: SlotProps) {
  if (!card) {
    return (
      <div
        className="flex h-16 w-12 items-center justify-center rounded-md border border-dashed border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground/60"
        aria-label={`Board slot ${index + 1} empty`}
      >
        ·
      </div>
    );
  }
  const rank = card[0];
  const suit = card[1];
  return (
    <div
      className="flex h-16 w-12 flex-col items-center justify-center rounded-md border border-border bg-card shadow-sm"
      aria-label={`Board card ${rank}${SUIT_GLYPH[suit] ?? suit}`}
    >
      <span className="font-mono text-xl font-bold leading-none">{rank}</span>
      <span className={cn("mt-0.5 text-base leading-none", SUIT_COLOR[suit])}>
        {SUIT_GLYPH[suit] ?? suit}
      </span>
    </div>
  );
}

export function BoardStrip({ board, className }: Props) {
  const cards = board ?? [];
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-felt/30 p-3",
        className,
      )}
      aria-label="Community board"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Slot key={i} index={i} card={cards[i]} />
      ))}
    </div>
  );
}
