// Bankroll status badge. Green ≥30 buy-ins, yellow 15..29, red <15.
import type { BankrollStatus } from "@/types/game";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  bankroll: BankrollStatus | null;
  className?: string;
}

export function BankrollPill({ bankroll, className }: Props) {
  if (!bankroll) {
    return (
      <Badge
        variant="outline"
        className={cn("uppercase tracking-wider text-muted-foreground", className)}
      >
        bankroll —
      </Badge>
    );
  }
  const { level, buyInsHeld } = bankroll;
  const variant: "default" | "warning" | "destructive" =
    level === "green" ? "default" : level === "yellow" ? "warning" : "destructive";
  return (
    <Badge
      variant={variant}
      className={cn("tabular-nums", className)}
      aria-label={`Bankroll: ${buyInsHeld.toFixed(1)} buy-ins, ${level}`}
    >
      {buyInsHeld.toFixed(1)} buy-ins · {level}
    </Badge>
  );
}
