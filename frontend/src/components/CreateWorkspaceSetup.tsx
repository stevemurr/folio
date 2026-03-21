import { FormEvent } from "react";
import { CalendarRange, Clock3, LayoutGrid, Settings2 } from "lucide-react";

import { defaultGuidedRunDate, GUIDED_RUN_INITIAL_CASH } from "../lib/guidedRun";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  error: string | null;
  onChange: (next: string) => void;
  onOpenBrowser?: () => void;
  onOpenSettings?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  savedCount: number;
  settingsDisabled?: boolean;
  startDate: string;
};

const DATE_PRESETS = [
  {
    age: "Age I",
    label: "Internet Age",
    date: "1998-02-18",
    note: "Late-web speculation before the bubble fully lifts off.",
  },
  {
    age: "Age II",
    label: "Crisis Age",
    date: "2008-09-15",
    note: "Credit shock, forced selling, and defensive tests.",
  },
  {
    age: "Age III",
    label: "Rebuild Age",
    date: "2009-03-09",
    note: "Start at the turn and measure who compounds fastest.",
  },
  {
    age: "Age IV",
    label: "Reopening Age",
    date: "2020-03-23",
    note: "Fast rebound, liquidity surge, and concentration risk.",
  },
];

function formatLongDate(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default function CreateWorkspaceSetup({
  error,
  onChange,
  onOpenBrowser,
  onOpenSettings,
  onSubmit,
  pending,
  savedCount,
  settingsDisabled,
  startDate,
}: Props) {
  const selectedPreset = DATE_PRESETS.find((preset) => preset.date === startDate);
  const isCustomAge = !selectedPreset;
  const resolvedStartDate = startDate || defaultGuidedRunDate();

  return (
    <Card className="surface-panel relative overflow-hidden border-border/80 shadow-panel">
      <div className="surface-grid-overlay pointer-events-none absolute inset-0 bg-[size:108px_108px] opacity-35" />
      <div className="surface-warm-glow pointer-events-none absolute inset-y-0 left-0 w-[42%]" />
      <div className="surface-cool-glow pointer-events-none absolute inset-y-0 right-0 w-[30%]" />

      <CardHeader className="relative gap-6 border-b border-border/60 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Folio Workspaces</Badge>
              <Badge variant="outline">{savedCount} saved</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-4xl leading-[0.94] sm:text-5xl">Create Workspace</CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Choose a starting age or lock one exact date, then build books from the same opening bell.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenBrowser ? (
              <Button onClick={onOpenBrowser} variant="ghost">
                <LayoutGrid className="h-4 w-4" />
                Workspace Browser
              </Button>
            ) : null}
            {onOpenSettings ? (
              <Button disabled={settingsDisabled} onClick={onOpenSettings} variant="ghost">
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative grid gap-6 pt-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {DATE_PRESETS.map((preset) => {
            const active = resolvedStartDate === preset.date;
            return (
              <button
                className={cn(
                  "rounded-[20px] border px-4 py-4 text-left transition-all",
                  active
                    ? "border-primary/20 bg-primary/10 shadow-[0_0_0_1px_rgba(242,139,61,0.18)]"
                    : "border-border/70 bg-card/60 hover:bg-card/85",
                )}
                key={preset.date}
                onClick={() => onChange(preset.date)}
                type="button"
              >
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
                    active
                      ? "border-primary/25 bg-primary/12 text-primary"
                      : "border-border/70 bg-background/65 text-muted-foreground",
                  )}
                >
                  {preset.age}
                </span>
                <strong className="mt-4 block text-lg text-foreground">{preset.label}</strong>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {formatLongDate(preset.date)}
                </span>
                <span className="mt-3 block text-sm leading-6 text-muted-foreground">{preset.note}</span>
              </button>
            );
          })}

          <div
            className={cn(
              "rounded-[20px] border px-4 py-4 transition-all",
              isCustomAge
                ? "border-secondary/25 bg-secondary/10 shadow-[0_0_0_1px_rgba(93,215,224,0.15)]"
                : "border-border/70 bg-card/60",
            )}
          >
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
                isCustomAge
                  ? "border-secondary/25 bg-secondary/12 text-secondary"
                  : "border-border/70 bg-background/65 text-muted-foreground",
              )}
            >
              Custom
            </span>
            <strong className="mt-4 block text-lg text-foreground">Custom Age</strong>
            <span className="mt-2 block text-sm text-muted-foreground">Pick any market start date.</span>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-foreground">
              <span className="sr-only">Workspace Start Date</span>
              <Input
                max={new Date().toISOString().slice(0, 10)}
                min="1980-01-01"
                onChange={(event) => onChange(event.target.value)}
                onFocus={() => {
                  if (!startDate) {
                    onChange(defaultGuidedRunDate());
                  }
                }}
                type="date"
                value={resolvedStartDate}
              />
            </label>
          </div>
        </div>

        <form className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]" onSubmit={onSubmit}>
          <div className="surface-panel-soft grid gap-4 rounded-[24px] border border-border/70 px-5 py-5 sm:grid-cols-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Selected Start
              </span>
              <strong className="mt-2 block text-lg">{selectedPreset?.label ?? "Custom Age"}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">{formatLongDate(resolvedStartDate)}</span>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Shared Bankroll
              </span>
              <strong className="mt-2 block font-mono text-lg">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(GUIDED_RUN_INITIAL_CASH)}
              </strong>
              <span className="mt-1 block text-sm text-muted-foreground">Every book starts from the same bankroll.</span>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Entry Rule
              </span>
              <strong className="mt-2 block text-lg">Next Session</strong>
              <span className="mt-1 block text-sm text-muted-foreground">
                Weekend and holiday starts roll forward to the next market session.
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <Button className="min-w-[15rem] justify-between" disabled={pending} size="lg" type="submit">
              <span>{pending ? "Creating..." : "Create Workspace"}</span>
              <CalendarRange className="h-4 w-4" />
            </Button>
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Start at {formatLongDate(resolvedStartDate)}
            </div>
          </div>

          {error ? (
            <p className="xl:col-span-2 rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
