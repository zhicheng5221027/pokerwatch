// Compact metrics strip beneath the HUD: equity, pot odds, MDF, SPR, COMMITTED flag.
import type { Recommendation } from "@/types/game";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";

interface Props {
  recommendation: Recommendation | null;
  className?: string;
}

interface MetricProps {
  label: string;
  value: string;
  tone?: "default" | "warn" | "good" | "muted";
}

function Metric({ label, value, tone = "default" }: MetricProps) {
  return (
    <div className="flex flex-col rounded-md border border-border/60 bg-secondary/40 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 font-mono text-sm tabular-nums",
          tone === "good" && "text-primary",
          tone === "warn" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function EquityRow({ recommendation, className }: Props) {
  const r = recommendation;
  const eq = r?.equityVsRange;
  const po = r?.potOdds;
  const mdf = r?.mdf;
  const spr = r?.spr;
  const committed = !!r?.committed;

  const equityTone: MetricProps["tone"] =
    eq == null ? "muted" : po != null && eq >= po ? "good" : eq >= 50 ? "good" : "warn";

  return (
    <div className={cn("flex flex-wrap items-stretch gap-2", className)}>
      <Metric
        label="equity"
        value={eq != null ? fmtPct(eq, 1) : "—"}
        tone={equityTone}
      />
      <Metric
        label="pot odds"
        value={po != null ? fmtPct(po, 1) : "—"}
        tone={po == null ? "muted" : "default"}
      />
      <Metric
        label="MDF"
        value={mdf != null ? fmtPct(mdf, 0) : "—"}
        tone={mdf == null ? "muted" : "default"}
      />
      <Metric
        label="SPR"
        value={spr != null && Number.isFinite(spr) ? spr.toFixed(1) : "—"}
        tone={spr == null ? "muted" : spr <= 4 ? "warn" : "default"}
      />
      <div className="ml-auto flex items-center">
        {committed ? (
          <Badge variant="destructive" className="uppercase tracking-wider">
            COMMITTED
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="uppercase tracking-wider text-muted-foreground"
          >
            uncommitted
          </Badge>
        )}
      </div>
    </div>
  );
}
