// Live readout of what the AI is currently seeing on the table:
// pot, blinds, street, your stack, and every other seat's stack + last action.
import type { GameState } from "@/types/game";
import { Card } from "@/components/ui/card";
import { fmtChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  gameState: GameState | null | undefined;
  heroName?: string;
}

const STREET_LABEL: Record<string, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  between: "Between hands",
};

export function TablePulse({ gameState, heroName }: Props) {
  if (!gameState) {
    return (
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Live table</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Capture is on — waiting for the first read of the table.
        </div>
      </Card>
    );
  }

  const sb = gameState.blinds?.sb ?? 0;
  const bb = gameState.blinds?.bb ?? 0;
  const street = STREET_LABEL[gameState.street] ?? gameState.street;
  const seats = (gameState.seats ?? []).filter((s) => s && (s.name || s.stack > 0));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Live table</div>
        <span className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[10px] uppercase tracking-wide">
          {street}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Pot" value={fmtChips(gameState.pot)} highlight />
        <Stat label="To call" value={gameState.toCall > 0 ? fmtChips(gameState.toCall) : "—"} />
        <Stat label="Blinds" value={bb ? `${fmtChips(sb)}/${fmtChips(bb)}` : "—"} />
      </div>

      <div className="mt-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
          You{heroName ? ` · ${heroName}` : ""}
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs text-muted-foreground">stack</span>
          <span className="tabular font-mono text-base font-semibold text-primary">
            {fmtChips(gameState.myStack)}
          </span>
          <span className="text-xs text-muted-foreground">
            {bb > 0 ? `${(gameState.myStack / bb).toFixed(1)}bb` : ""}
          </span>
        </div>
      </div>

      {seats.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Table ({seats.length})
          </div>
          <div className="space-y-1">
            {seats
              .filter((s) => !s.isHero)
              .sort((a, b) => a.seatNum - b.seatNum)
              .map((s) => (
                <div
                  key={s.seatNum}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs",
                    s.inHand ? "bg-secondary/40" : "bg-secondary/10 text-muted-foreground",
                    gameState.actionOnSeat === s.seatNum && "ring-1 ring-warning/60",
                  )}
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">{s.seatNum}.</span>{" "}
                    <span className={cn(!s.inHand && "line-through")}>{s.name ?? "—"}</span>
                  </span>
                  <span className="tabular font-mono">
                    {s.stack > 0 ? fmtChips(s.stack) : "—"}
                  </span>
                  <span className="w-14 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.lastAction ?? (s.inHand ? "in" : "out")}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border/60 px-2 py-1.5", highlight && "border-primary/40 bg-primary/5")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabular font-mono text-sm", highlight && "font-semibold text-primary")}>{value}</div>
    </div>
  );
}
