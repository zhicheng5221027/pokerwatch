// Live overlay page. Composes the screen-capture loop, the recommendation HUD,
// the side rail (hand log + session stats + opponents + tilt), and the
// settings drawer. Renders sensibly even when no session is running.
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { History, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

import { HudCard } from "@/components/overlay/HudCard";
import { EquityRow } from "@/components/overlay/EquityRow";
import { ActionStrip } from "@/components/overlay/ActionStrip";
import { BoardStrip } from "@/components/overlay/BoardStrip";
import { HoleCards } from "@/components/overlay/HoleCards";
import { BankrollPill } from "@/components/overlay/BankrollPill";
import { WatchControls } from "@/components/overlay/WatchControls";
import { TablePulse } from "@/components/overlay/TablePulse";

import { HandLog } from "@/components/side/HandLog";
import { SessionStats } from "@/components/side/SessionStats";
import { OpponentsPanel } from "@/components/side/OpponentsPanel";
import { TiltBanner } from "@/components/side/TiltBanner";

import { SettingsDrawer } from "@/components/settings/SettingsDrawer";

import { useScreenCapture } from "@/hooks/useScreenCapture";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { useSession } from "@/hooks/useSession";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";
import { status as bankrollStatus } from "@/engine/bankroll";

export default function Index() {
  const captureIntervalMs = useSettings((s) => s.captureIntervalMs);
  const bankrollChips = useSettings((s) => s.bankrollChips);
  const heroName = useSettings((s) => s.heroName);

  const capture = useScreenCapture({ intervalMs: captureIntervalMs });
  useFrameLoop(capture);

  const session = useSession();
  const recommendation = useSessionStore((s) => s.recommendation);
  const gameState = useSessionStore((s) => s.lastGameState);

  // When the user stops sharing the browser stream, also end the session.
  const sessionIsActive = session.isActive;
  const sessionStop = session.stop;
  useEffect(() => {
    if (!capture.isSharing && sessionIsActive) {
      void sessionStop();
    }
  }, [capture.isSharing, sessionIsActive, sessionStop]);

  const onStart = async () => {
    await capture.start();
    if (!session.isActive) await session.start();
  };
  const onStop = () => {
    capture.stop();
    void session.stop();
  };

  const bb = gameState?.blinds.bb ?? 0;
  const bankroll = useMemo(
    () => (bb > 0 ? bankrollStatus(bankrollChips, bb) : null),
    [bb, bankrollChips],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" aria-hidden />
            <span className="font-semibold tracking-tight">PokerWatch</span>
          </div>
          <span className="text-xs text-muted-foreground">
            study tool · doesn't click for you
          </span>
          <div className="ml-auto flex items-center gap-2">
            <WatchControls
              isSharing={capture.isSharing}
              isStarting={capture.isStarting}
              isSessionActive={session.isActive}
              error={capture.error}
              lastFrameAt={capture.lastFrameAt}
              onStart={onStart}
              onStop={onStop}
            />
            <Button asChild variant="ghost" size="sm">
              <Link to="/sessions" aria-label="View past sessions">
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sessions</span>
              </Link>
            </Button>
            <SettingsDrawer />
          </div>
        </header>

        {/* Main grid */}
        <main className="container flex-1 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,340px)]">
            {/* Column 1 — table-state + recommendation */}
            <section className="space-y-4 xl:col-start-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto,1fr] sm:items-start">
                <HoleCards cards={gameState?.myHole} />
                <BoardStrip board={gameState?.board} />
              </div>

              <HudCard recommendation={recommendation} />
              <EquityRow recommendation={recommendation} />
              <ActionStrip gameState={gameState} />
            </section>

            {/* Column 2 — live table + hand log */}
            <section className="space-y-4 xl:col-start-2">
              <TablePulse gameState={gameState} heroName={heroName} />
              <HandLog />
            </section>

            {/* Column 3 — session + opponents + tilt + bankroll */}
            <section className="space-y-4 xl:col-start-3">
              <TiltBanner />
              <SessionStats />
              <OpponentsPanel />
              <div className="flex items-center justify-end">
                <BankrollPill bankroll={bankroll} />
              </div>
            </section>
          </div>
        </main>

        {/* Footer disclaimer */}
        <footer className="border-t border-border/60 bg-background/60 px-4 py-3 text-center">
          <p className="text-[11px] text-muted-foreground">
            Study tool. Doesn't click for you. ToS-aware: prefer GC tables.
          </p>
        </footer>
      </div>
    </TooltipProvider>
  );
}
