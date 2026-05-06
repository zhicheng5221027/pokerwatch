// Stripped-down overlay: header + your cards + board + ONE big recommendation
// card + a single line of pot/stack/blinds + the debug strip. Nothing else.
//
// Hand log, session stats, opponents profile, tilt, bankroll — all removed.
// They were noise. We can re-introduce them when basic flow is rock-solid.
import { useEffect } from "react";
import { Eye } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { HudCard } from "@/components/overlay/HudCard";
import { BoardStrip } from "@/components/overlay/BoardStrip";
import { HoleCards } from "@/components/overlay/HoleCards";
import { WatchControls } from "@/components/overlay/WatchControls";
import { DebugStrip } from "@/components/overlay/DebugStrip";
import { SettingsDrawer } from "@/components/settings/SettingsDrawer";

import { useScreenCapture } from "@/hooks/useScreenCapture";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { useSession } from "@/hooks/useSession";
import { useSessionStore } from "@/store/session";
import { useSettings } from "@/store/settings";
import { fmtChips } from "@/lib/format";

const STREET_LABEL: Record<string, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  between: "Between hands",
};

export default function Index() {
  const captureIntervalMs = useSettings((s) => s.captureIntervalMs);
  const heroName = useSettings((s) => s.heroName);

  const capture = useScreenCapture({ intervalMs: captureIntervalMs, maxSide: 768, jpegQuality: 0.6 });
  useFrameLoop(capture);

  const session = useSession();
  const recommendation = useSessionStore((s) => s.recommendation);
  const gs = useSessionStore((s) => s.lastGameState);

  const sessionIsActive = session.isActive;
  const sessionStop = session.stop;
  useEffect(() => {
    if (!capture.isSharing && sessionIsActive) void sessionStop();
  }, [capture.isSharing, sessionIsActive, sessionStop]);

  const onStart = async () => {
    await capture.start();
    if (!session.isActive) await session.start();
  };
  const onStop = () => {
    capture.stop();
    void session.stop();
  };

  const heroSeat = gs?.seats?.find((s) => s.isHero);
  const detectedName = heroSeat?.name ?? null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
          <Eye className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-semibold tracking-tight">PokerWatch</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">study tool</span>
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
            <SettingsDrawer />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
          {/* Your hand + board */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Your hand
                {heroName ? <span className="ml-1 text-foreground/80">· {heroName}</span> : null}
              </div>
              <HoleCards cards={gs?.myHole} />
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Board · {STREET_LABEL[gs?.street ?? ""] ?? "—"}
              </div>
              <BoardStrip board={gs?.board} />
            </div>
          </section>

          {/* The big recommendation */}
          <HudCard recommendation={recommendation} />

          {/* One-line table read */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pot" value={gs ? fmtChips(gs.pot) : "—"} highlight />
            <Stat label="To call" value={gs && gs.toCall > 0 ? fmtChips(gs.toCall) : "—"} />
            <Stat label="Your stack" value={gs ? fmtChips(gs.myStack) : "—"} />
            <Stat
              label="Blinds"
              value={gs && gs.blinds.bb ? `${fmtChips(gs.blinds.sb)}/${fmtChips(gs.blinds.bb)}` : "—"}
            />
          </div>

          {/* Hero confirmation */}
          {capture.isSharing && (
            <div className="text-center text-[11px] text-muted-foreground">
              {gs && heroSeat
                ? <>Identified you as <span className="text-primary">{detectedName ?? `seat ${heroSeat.seatNum}`}</span> — if wrong, set Hero name in Settings.</>
                : capture.lastFrameAt
                  ? "Reading table…"
                  : "Click Start watching, then share the poker tab."}
            </div>
          )}

          <DebugStrip />
        </main>

        <footer className="border-t border-border/60 bg-background/60 px-4 py-3 text-center">
          <p className="text-[11px] text-muted-foreground">
            Study tool. Doesn't click for you. ToS-aware: prefer GC tables.
          </p>
        </footer>
      </div>
    </TooltipProvider>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={
        "rounded-md border border-border/60 px-3 py-2 " +
        (highlight ? "border-primary/40 bg-primary/5" : "")
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          "tabular font-mono text-lg " + (highlight ? "font-semibold text-primary" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
