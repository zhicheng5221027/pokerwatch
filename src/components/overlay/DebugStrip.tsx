// Tiny debug strip showing the loop's state. Lives at the bottom of the
// overlay column so we can verify the pipeline is firing without devtools.
import { useEffect, useState } from "react";
import { useDebug } from "@/store/debug";
import { cn } from "@/lib/utils";

export function DebugStrip() {
  const { framesSeen, status, message, updatedAt } = useDebug();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ageSec = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const color =
    status === "ok"
      ? "text-success"
      : status === "err"
        ? "text-destructive"
        : status === "calling"
          ? "text-warning"
          : "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/40 bg-secondary/20 px-3 py-1.5 text-[11px]">
      <span className="font-mono uppercase tracking-wide text-muted-foreground">debug</span>
      <span className="tabular">frames {framesSeen}</span>
      <span className={cn("font-mono uppercase", color)}>{status}</span>
      <span className="truncate text-muted-foreground">{message}</span>
      {ageSec !== null && <span className="ml-auto tabular text-muted-foreground">{ageSec}s ago</span>}
    </div>
  );
}
