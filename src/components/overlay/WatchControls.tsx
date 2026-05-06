// Start/Stop screen-share button + status dots: capture, session, last frame age.
import { useEffect, useState } from "react";
import { Play, Square, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  isSharing: boolean;
  isStarting: boolean;
  isSessionActive: boolean;
  error: string | null;
  lastFrameAt: number | null;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

function StatusDot({
  ok,
  label,
  warn,
}: {
  ok: boolean;
  label: string;
  warn?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          ok
            ? warn
              ? "bg-warning"
              : "bg-primary animate-pulse"
            : "bg-muted",
        )}
        aria-hidden
      />
      <span className="uppercase tracking-wider">{label}</span>
    </span>
  );
}

export function WatchControls({
  isSharing,
  isStarting,
  isSessionActive,
  error,
  lastFrameAt,
  onStart,
  onStop,
  className,
}: Props) {
  // Re-render once a second so the "last frame age" stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ageSec =
    lastFrameAt != null ? Math.max(0, Math.round((Date.now() - lastFrameAt) / 1000)) : null;
  const stale = ageSec != null && ageSec > 6;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {!isSharing ? (
        <Button
          onClick={onStart}
          disabled={isStarting}
          aria-label="Start watching"
          size="sm"
        >
          <Play className="h-3.5 w-3.5" />
          <span>{isStarting ? "Starting…" : "Start watching"}</span>
        </Button>
      ) : (
        <Button
          onClick={onStop}
          variant="destructive"
          size="sm"
          aria-label="Stop watching"
        >
          <Square className="h-3.5 w-3.5" />
          <span>Stop</span>
        </Button>
      )}
      <div className="hidden items-center gap-3 sm:flex">
        <StatusDot ok={isSharing} label="capture" warn={stale} />
        <StatusDot ok={isSessionActive} label="session" />
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {ageSec == null ? "—" : `${ageSec}s ago`}
        </span>
      </div>
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
    </div>
  );
}
