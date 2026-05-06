// Settings drawer (right-side sheet). Wires to the persisted Zustand store.
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon } from "lucide-react";
import { useSettings, type Platform, type RiskProfile } from "@/store/settings";

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "stake.us", label: "Stake.us" },
  { value: "pokerstars", label: "PokerStars" },
  { value: "ggpoker", label: "GGPoker" },
  { value: "acr", label: "ACR" },
  { value: "generic", label: "Generic" },
];

const RISK_OPTIONS: { value: RiskProfile; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "standard", label: "Standard" },
  { value: "loose", label: "Loose" },
];

const AI_MODEL_OPTIONS = ["gpt-5.5", "gpt-5", "gpt-4o", "claude-opus-4-7"];

export function SettingsDrawer() {
  const s = useSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open settings">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Tune capture, identity, and strategy. Stored locally on this device.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 pb-6">
          <div className="space-y-2">
            <Label htmlFor="heroName">Hero name</Label>
            <Input
              id="heroName"
              placeholder="Your screen name at the table"
              value={s.heroName}
              onChange={(e) => s.setHeroName(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Vision uses this to find your seat. Falls back to face-up holes if blank.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Platform</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={s.platform === opt.value ? "default" : "outline"}
                  onClick={() => s.setPlatform(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="captureInterval">Capture interval</Label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {(s.captureIntervalMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Slider
              id="captureInterval"
              min={1000}
              max={10000}
              step={500}
              value={[s.captureIntervalMs]}
              onValueChange={(v) => s.setCaptureIntervalMs(v[0] ?? 2500)}
            />
            <p className="text-xs text-muted-foreground">
              How often we sample the screen. Default 2.5s.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Risk profile</Label>
            <div className="flex gap-1.5">
              {RISK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={s.riskProfile === opt.value ? "default" : "outline"}
                  onClick={() => s.setRiskProfile(opt.value)}
                  className="flex-1"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>AI model</Label>
            <div className="flex flex-wrap gap-1.5">
              {AI_MODEL_OPTIONS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={s.aiModel === m ? "default" : "outline"}
                  onClick={() => s.setAiModel(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="bankroll">Bankroll (chips)</Label>
            <Input
              id="bankroll"
              type="number"
              min={0}
              step={100}
              value={s.bankrollChips}
              onChange={(e) =>
                s.setBankrollChips(Number.parseInt(e.target.value, 10) || 0)
              }
              className="font-mono tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              Used for buy-in level (green/yellow/red) and stop-loss alerts.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="keepHistory" className="cursor-pointer">
                Keep history
              </Label>
              <p className="text-xs text-muted-foreground">
                Persist hand log + sessions in cloud sync.
              </p>
            </div>
            <Switch
              id="keepHistory"
              checked={s.keepHistory}
              onCheckedChange={s.setKeepHistory}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
