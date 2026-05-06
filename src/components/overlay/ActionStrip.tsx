// Pills representing this hand's action history, grouped by street.
import type { ActionEvent, GameState } from "@/types/game";
import { cn } from "@/lib/utils";
import { fmtChips } from "@/lib/format";

interface Props {
  gameState: GameState | null;
  className?: string;
}

const STREET_ORDER: GameState["street"][] = [
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
];

function actionLabel(e: ActionEvent): string {
  const verb = e.verb;
  if (e.amount != null && (verb === "bet" || verb === "raise" || verb === "call")) {
    return `${verb} ${fmtChips(e.amount)}`;
  }
  return verb;
}

export function ActionStrip({ gameState, className }: Props) {
  const history = gameState?.actionHistory ?? [];
  if (!history.length) {
    return (
      <div
        className={cn(
          "flex h-9 items-center rounded-md border border-dashed border-border/60 px-3 text-[11px] uppercase tracking-wide text-muted-foreground",
          className,
        )}
      >
        no action this hand yet
      </div>
    );
  }

  // Group action events by street, preserving order.
  const byStreet = new Map<GameState["street"], ActionEvent[]>();
  for (const a of history) {
    const arr = byStreet.get(a.street) ?? [];
    arr.push(a);
    byStreet.set(a.street, arr);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-secondary/30 p-2",
        className,
      )}
      aria-label="Action history this hand"
    >
      {STREET_ORDER.filter((s) => byStreet.has(s)).map((street, idx, arr) => (
        <div key={street} className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {street}
          </span>
          {(byStreet.get(street) ?? []).map((a, i) => (
            <span
              key={`${street}-${i}`}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
                a.verb === "fold" && "bg-muted text-muted-foreground",
                a.verb === "check" && "bg-secondary text-secondary-foreground",
                (a.verb === "call" || a.verb === "bet") &&
                  "bg-accent/20 text-accent-foreground",
                (a.verb === "raise" || a.verb === "all-in") &&
                  "bg-primary/20 text-primary",
              )}
            >
              s{a.seatNum} {actionLabel(a)}
            </span>
          ))}
          {idx < arr.length - 1 && (
            <span className="text-muted-foreground/60">·</span>
          )}
        </div>
      ))}
    </div>
  );
}
