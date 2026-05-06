// Animated banner that surfaces tilt level ≥1. Hidden when level is 0.
import { AlertTriangle, OctagonAlert } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { cn } from "@/lib/utils";

const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: "Tilt risk: ease up. Bias to fold and check-call.",
  2: "Tilt elevated. Skip thin spots, no shoves.",
  3: "Take a 5-minute break. Bankroll first.",
};

export function TiltBanner() {
  const tilt = useSessionStore((s) => s.tilt);
  if (tilt.level < 1) return null;

  const level = tilt.level as 1 | 2 | 3;
  const Icon = level >= 3 ? OctagonAlert : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 overflow-hidden rounded-lg border p-3 text-sm shadow-sm",
        "animate-in fade-in slide-in-from-top-2",
        level === 1 && "border-warning/40 bg-warning/10 text-warning",
        level === 2 && "border-warning/60 bg-warning/15 text-warning",
        level === 3 && "border-destructive/60 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{LEVEL_TEXT[level]}</p>
        {tilt.flags.length > 0 && (
          <p className="mt-1 truncate font-mono text-[11px] opacity-80">
            {tilt.flags.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
