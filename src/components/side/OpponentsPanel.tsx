// Per-seat opponent profile chips. Reads from session store.
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/store/session";
import type { OpponentProfile } from "@/types/game";
import { cn } from "@/lib/utils";

const LABEL_TONE: Record<OpponentProfile["label"], string> = {
  "calling-station": "bg-warning/20 text-warning",
  nit: "bg-muted text-muted-foreground",
  TAG: "bg-accent/20 text-accent-foreground",
  LAG: "bg-primary/20 text-primary",
  maniac: "bg-destructive/20 text-destructive",
  fish: "bg-success/20 text-success",
  unknown: "bg-secondary text-muted-foreground",
};

export function OpponentsPanel() {
  const opponents = useSessionStore((s) => s.opponents);
  const list = Object.values(opponents).sort((a, b) => a.seatNum - b.seatNum);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Opponents</CardTitle>
        <Badge variant="secondary" className="tabular-nums">
          {list.length}
        </Badge>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No opponents profiled yet. Profile builds after ~30 hands.
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((p) => (
              <li
                key={p.seatNum}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    s{p.seatNum}
                  </span>
                  <span className="truncate font-medium">
                    {p.name ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] uppercase",
                      LABEL_TONE[p.label] ?? LABEL_TONE.unknown,
                    )}
                  >
                    {p.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-muted-foreground">
                  <span>VPIP {Math.round(p.vpip)}</span>
                  <span>PFR {Math.round(p.pfr)}</span>
                  <span>AF {p.af.toFixed(1)}</span>
                  <span className="text-foreground/60">·</span>
                  <span>{p.hands}h</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
