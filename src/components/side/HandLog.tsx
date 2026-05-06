// Last-50 hands list. Click a row to expand its full reasoning.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useHandLog } from "@/store/handlog";
import { fmtChips } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HandLog() {
  const hands = useHandLog((s) => s.hands);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card className="flex h-full min-h-[320px] flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Hand log</CardTitle>
        <Badge variant="secondary" className="tabular-nums">
          {hands.length}/50
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {hands.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
            No hands logged yet. Start watching to record this session.
          </div>
        ) : (
          <ScrollArea className="h-full max-h-[60vh]">
            <ul className="divide-y divide-border/60">
              {hands.map((h) => {
                const open = openId === h.id;
                const won = (h.resultChips ?? 0) > 0;
                const lost = (h.resultChips ?? 0) < 0;
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : h.id)}
                      className={cn(
                        "w-full px-4 py-2 text-left transition-colors hover:bg-secondary/50",
                        open && "bg-secondary/40",
                      )}
                      aria-expanded={open}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                          <span className="text-muted-foreground">
                            #{h.handNumber}
                          </span>
                          {h.position && (
                            <span className="text-foreground/80">{h.position}</span>
                          )}
                          {h.holeCards && h.holeCards.length === 2 && (
                            <span className="text-foreground">
                              {h.holeCards.join(" ")}
                            </span>
                          )}
                          {h.board && h.board.length > 0 && (
                            <span className="text-muted-foreground">
                              · {h.board.join(" ")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {h.recommendation?.action && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase"
                            >
                              {h.recommendation.action}
                            </Badge>
                          )}
                          {h.resultChips != null && (
                            <span
                              className={cn(
                                "font-mono text-[11px] tabular-nums",
                                won && "text-primary",
                                lost && "text-destructive",
                                !won && !lost && "text-muted-foreground",
                              )}
                            >
                              {h.resultChips > 0 ? "+" : ""}
                              {fmtChips(h.resultChips)}
                            </span>
                          )}
                        </div>
                      </div>
                      {open && (
                        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                          {h.reasoning && <p>{h.reasoning}</p>}
                          {h.recommendation?.reasoning && !h.reasoning && (
                            <p>{h.recommendation.reasoning}</p>
                          )}
                          {h.potFinal != null && (
                            <p className="font-mono tabular-nums">
                              pot {fmtChips(h.potFinal)} · street {h.streetReached ?? "—"}
                            </p>
                          )}
                          {h.myAction && (
                            <p className="font-mono">my action: {h.myAction}</p>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
