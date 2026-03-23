import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";

import { WorkspaceSummary } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type Props = {
  deletingWorkspaceId?: string | null;
  loading?: boolean;
  onCreateWorkspace: () => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onPickWorkspace: (workspaceId: string) => void;
  onReturnToWorkspace?: () => void;
  selectedWorkspaceId?: string | null;
  workspaces: WorkspaceSummary[];
};

function workspaceSummary(workspace: WorkspaceSummary) {
  const bookLabel = `${workspace.book_count} ${workspace.book_count === 1 ? "book" : "books"}`;
  const cohortLabel = `${workspace.collection_count} ${workspace.collection_count === 1 ? "cohort" : "cohorts"}`;

  if (workspace.run_state.status === "blocked") {
    return `${bookLabel} across ${cohortLabel}. Repair blocked books before replay.`;
  }
  return workspace.book_count
    ? `${bookLabel} across ${cohortLabel}.`
    : `No books yet. Start building this cohort set.`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function seasonLabel(value: string) {
  const date = parseDate(value);
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month <= 1 || month === 11) {
    return `Winter ${year}`;
  }
  if (month <= 4) {
    return `Spring ${year}`;
  }
  if (month <= 7) {
    return `Summer ${year}`;
  }
  return `Fall ${year}`;
}

function workspaceYear(value: string) {
  return parseDate(value).getFullYear();
}

function dateTone(value: string) {
  const date = parseDate(value);
  const palettes = [
    {
      card: "border-sky-500/18 bg-sky-500/[0.045] hover:bg-sky-500/[0.075]",
      pill: "border-sky-500/20 bg-sky-500/10 text-sky-700",
      year: "text-sky-700/12",
    },
    {
      card: "border-amber-500/18 bg-amber-500/[0.045] hover:bg-amber-500/[0.075]",
      pill: "border-amber-500/22 bg-amber-500/10 text-amber-700",
      year: "text-amber-700/12",
    },
    {
      card: "border-rose-500/18 bg-rose-500/[0.045] hover:bg-rose-500/[0.075]",
      pill: "border-rose-500/22 bg-rose-500/10 text-rose-700",
      year: "text-rose-700/12",
    },
    {
      card: "border-teal-500/18 bg-teal-500/[0.045] hover:bg-teal-500/[0.075]",
      pill: "border-teal-500/22 bg-teal-500/10 text-teal-700",
      year: "text-teal-700/12",
    },
  ];
  return palettes[(date.getFullYear() + date.getMonth()) % palettes.length];
}

function cardTone(workspace: WorkspaceSummary, active: boolean) {
  const tone = dateTone(workspace.start_date);
  return cn(
    "relative overflow-hidden",
    tone.card,
    active ? "shadow-[0_0_0_1px_rgba(93,215,224,0.2)]" : "",
  );
}

export default function WorkspaceBrowser({
  deletingWorkspaceId = null,
  loading = false,
  onCreateWorkspace,
  onDeleteWorkspace,
  onPickWorkspace,
  onReturnToWorkspace,
  selectedWorkspaceId,
  workspaces,
}: Props) {
  return (
    <Card className="surface-panel relative overflow-hidden border-border/80 shadow-panel">
      <div className="surface-grid-overlay pointer-events-none absolute inset-0 bg-[size:108px_108px] opacity-35" />

      <CardHeader className="relative gap-6 border-b border-border/60 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Workspace Browser</Badge>
              <Badge variant="outline">{loading ? "..." : workspaces.length} saved</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-4xl leading-[0.94] sm:text-5xl">Open Workspace</CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Pick a saved age, then keep building books or run the comparison from the start.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onReturnToWorkspace ? (
              <Button onClick={onReturnToWorkspace} variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Back to Workspace
              </Button>
            ) : null}
            <Button onClick={onCreateWorkspace} variant="secondary">
              Create Workspace
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative pt-6">
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="rounded-[20px] border border-border/70 bg-card/60 px-5 py-5" key={index}>
                <div className="h-5 w-40 rounded-full bg-white/8" />
                <div className="mt-4 flex gap-2">
                  <div className="h-7 w-36 rounded-full bg-white/8" />
                  <div className="h-7 w-24 rounded-full bg-white/8" />
                </div>
              </div>
            ))}
          </div>
        ) : workspaces.length ? (
          <div className="grid gap-3">
            {workspaces.map((workspace) => {
              const active = workspace.id === selectedWorkspaceId;
              const deleting = deletingWorkspaceId === workspace.id;
              const tone = dateTone(workspace.start_date);
              return (
                <div
                  className={cn("rounded-[22px] border px-5 py-5 transition-all", cardTone(workspace, active))}
                  key={workspace.id}
                >
                  <div className="flex items-center gap-2">
                    <button
                      className="group min-w-0 flex-1 text-left"
                      disabled={deleting}
                      onClick={() => onPickWorkspace(workspace.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge variant="outline">
                              {workspace.collection_count} {workspace.collection_count === 1 ? "cohort" : "cohorts"}
                            </Badge>
                            <Badge className={tone.pill} variant="outline">
                              {seasonLabel(workspace.start_date)}
                            </Badge>
                          </div>
                          <div className="space-y-1.5">
                            <strong className="block font-display text-[2rem] leading-none tracking-tight text-foreground sm:text-[2.35rem]">
                              {workspace.name}
                            </strong>
                            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                              {workspaceSummary(workspace)}
                            </p>
                          </div>
                        </div>
                        <div className="hidden items-center gap-4 lg:flex">
                          <span className={cn("font-display text-6xl leading-none tracking-tight", tone.year)}>
                            {workspaceYear(workspace.start_date)}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 lg:hidden" />
                      </div>
                    </button>

                    {onDeleteWorkspace ? (
                      <Button
                        aria-label="Delete workspace"
                        className="shrink-0 self-center"
                        disabled={deleting}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteWorkspace(workspace.id);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="surface-panel-soft grid min-h-[320px] place-items-center rounded-[22px] border border-dashed border-border/70 px-6 text-center">
            <div className="max-w-sm">
              <p className="text-lg font-semibold">No saved workspaces yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create a workspace first, then come back here when you want to reopen one.
              </p>
              <Button className="mt-4" onClick={onCreateWorkspace}>
                Create Workspace
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
