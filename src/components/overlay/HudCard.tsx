// The big-action recommendation card. Action verb in huge type, raise sizing
// in monospace if applicable, confidence pill, one-line reason, source tag.
import type { Recommendation } from "@/types/game";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtChips } from "@/lib/format";

interface Props {
  recommendation: Recommendation | null;
  className?: string;
}

const ACTION_COLORS: Record<Recommendation["action"], string> = {
  fold: "text-muted-foreground",
  check: "text-foreground",
  call: "text-accent",
  raise: "text-primary",
  "all-in": "text-warning",
  wait: "text-muted-foreground",
};

function confidenceTone(c: number): "default" | "secondary" | "warning" {
  if (c >= 70) return "default";
  if (c >= 40) return "secondary";
  return "warning";
}

export function HudCard({ recommendation, className }: Props) {
  const r = recommendation;
  const action = r?.action ?? "wait";
  const verb = action.toUpperCase();
  const conf = r?.confidence ?? 0;
  const reason = r?.reasoning ?? "Waiting for game state…";
  const source = r?.source ?? "fallback";

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm",
        className,
      )}
      aria-label={`Recommended action: ${verb}`}
    >
      {/* subtle accent stripe on the left */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          action === "raise" || action === "all-in"
            ? "bg-primary"
            : action === "fold"
              ? "bg-destructive/60"
              : action === "call"
                ? "bg-accent"
                : "bg-border",
        )}
        aria-hidden
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={cn(
                "text-5xl font-extrabold leading-none tracking-tight tabular-nums",
                ACTION_COLORS[action],
              )}
            >
              {verb}
              {action === "raise" && r?.sizing != null && (
                <span className="ml-3 font-mono text-3xl text-foreground/80">
                  {fmtChips(r.sizing)}
                </span>
              )}
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {reason}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={confidenceTone(conf)} className="tabular-nums">
              {Math.round(conf)}%
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {source.replace("-", " ")}
            </Badge>
          </div>
        </div>

        {r?.alternatives && r.alternatives.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              alts
            </span>
            {r.alternatives.map((alt, i) => (
              <Badge
                key={`${alt.action}-${i}`}
                variant="secondary"
                className="text-[10px] tabular-nums"
              >
                {alt.action.toUpperCase()}
                {alt.sizing != null ? ` ${fmtChips(alt.sizing)}` : ""}
                {" · "}
                {Math.round(alt.weight * 100)}%
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
