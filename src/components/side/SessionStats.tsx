// Compact dashboard tile for the active session.
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { selectStats, useSessionStore } from "@/store/session";
import { fmtChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RowProps {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "muted";
}

function Row({ label, value, tone = "default" }: RowProps) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "good" && "text-primary",
          tone === "warn" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SessionStats() {
  const hands = useSessionStore((s) => s.hands);
  const stats = useMemo(() => selectStats(hands), [hands]);

  const followedPct =
    stats.hands > 0
      ? Math.round((stats.followedRecHands / stats.hands) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Row label="hands" value={String(stats.hands)} />
        <Row
          label="net chips"
          value={`${stats.netChips > 0 ? "+" : ""}${fmtChips(stats.netChips)}`}
          tone={
            stats.netChips > 0
              ? "good"
              : stats.netChips < 0
                ? "warn"
                : "default"
          }
        />
        <Row label="BB/100 (est)" value={stats.bbPer100.toFixed(1)} />
        <Separator className="my-2" />
        <Row label="followed rec" value={`${followedPct}%`} />
        <Row
          label="followed Δ"
          value={`${stats.followedRecNet > 0 ? "+" : ""}${fmtChips(stats.followedRecNet)}`}
          tone={
            stats.followedRecNet > 0
              ? "good"
              : stats.followedRecNet < 0
                ? "warn"
                : "muted"
          }
        />
        <Row
          label="diverged Δ"
          value={`${stats.unfollowedRecNet > 0 ? "+" : ""}${fmtChips(stats.unfollowedRecNet)}`}
          tone={
            stats.unfollowedRecNet > 0
              ? "good"
              : stats.unfollowedRecNet < 0
                ? "warn"
                : "muted"
          }
        />
        <Separator className="my-2" />
        <Row
          label="biggest pot won"
          value={fmtChips(stats.biggestPotWon)}
          tone={stats.biggestPotWon > 0 ? "good" : "muted"}
        />
        <Row
          label="biggest pot lost"
          value={fmtChips(stats.biggestPotLost)}
          tone={stats.biggestPotLost < 0 ? "warn" : "muted"}
        />
      </CardContent>
    </Card>
  );
}
