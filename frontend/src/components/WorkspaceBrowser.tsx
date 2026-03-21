import { ArrowRight, Clock3, LayoutGrid, Settings2 } from "lucide-react";

import { WorkspaceSummary } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type Props = {
  loading?: boolean;
  onCreateWorkspace: () => void;
  onOpenSettings?: () => void;
  onPickWorkspace: (workspaceId: string) => void;
  onReturnToWorkspace?: () => void;
  selectedWorkspaceId?: string | null;
  settingsDisabled?: boolean;
  workspaces: WorkspaceSummary[];
};

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

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function WorkspaceBrowser({
  loading = false,
  onCreateWorkspace,
  onOpenSettings,
  onPickWorkspace,
  onReturnToWorkspace,
  selectedWorkspaceId,
  settingsDisabled,
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
                <LayoutGrid className="h-4 w-4" />
                Current Workspace
              </Button>
            ) : null}
            <Button onClick={onCreateWorkspace} variant="secondary">
              Create Workspace
            </Button>
            {onOpenSettings ? (
              <Button disabled={settingsDisabled} onClick={onOpenSettings} variant="ghost">
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
            ) : null}
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
              return (
                <button
                  className={cn(
                    "rounded-[20px] border px-5 py-5 text-left transition-all",
                    active
                      ? "border-secondary/30 bg-secondary/12 shadow-[0_0_0_1px_rgba(93,215,224,0.15)]"
                      : "border-border/70 bg-card/60 hover:bg-card/85",
                  )}
                  key={workspace.id}
                  onClick={() => onPickWorkspace(workspace.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <strong className="block text-xl text-foreground">{workspace.name}</strong>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formatLongDate(workspace.start_date)}</Badge>
                        <Badge variant="outline">
                          {workspace.book_count} {workspace.book_count === 1 ? "book" : "books"}
                        </Badge>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="surface-panel-soft rounded-[16px] border border-border/70 px-4 py-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Start Date
                      </span>
                      <span className="mt-2 block text-sm text-foreground">{formatLongDate(workspace.start_date)}</span>
                    </div>
                    <div className="surface-panel-soft rounded-[16px] border border-border/70 px-4 py-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Created
                      </span>
                      <span className="mt-2 inline-flex items-center gap-2 text-sm text-foreground">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatCreatedAt(workspace.created_at)}
                      </span>
                    </div>
                  </div>
                </button>
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
