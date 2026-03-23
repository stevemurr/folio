import { Activity, Plus, Trash2 } from "lucide-react";

import type { SimulationSummary } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";

type Props = {
  simulations: SimulationSummary[];
  onCreateSimulation: () => void;
  onSelectSimulation: (simulationId: string) => void;
  onDeleteSimulation: (simulationId: string) => void;
  selectedSimulationId: string | null;
  deletePendingId: string | null;
};

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatSharpe(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(2);
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
};

export default function SimulationsPanel({
  simulations,
  onCreateSimulation,
  onSelectSimulation,
  onDeleteSimulation,
  selectedSimulationId,
  deletePendingId,
}: Props) {
  return (
    <Card className="surface-panel border-border/80">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary">Simulations</Badge>
          <Badge variant="outline">
            {simulations.length} {simulations.length === 1 ? "run" : "runs"}
          </Badge>
        </div>

        <Button onClick={onCreateSimulation} size="sm">
          <Plus className="h-4 w-4" />
          New Simulation
        </Button>
      </CardHeader>

      <CardContent className="grid gap-4 pt-6">
        {!simulations.length ? (
          <div className="surface-panel-muted grid min-h-[120px] place-items-center rounded-[18px] border border-dashed border-border/70 px-6 text-center">
            <div className="max-w-md">
              <p className="text-base font-semibold">No simulations yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Run N agents with different strategies against the same market data.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {simulations.map((sim) => (
              <div
                className={cn(
                  "group relative overflow-hidden rounded-[18px] border bg-card/70 px-5 py-4 text-left transition-all cursor-pointer",
                  selectedSimulationId === sim.id
                    ? "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                    : "hover:-translate-y-0.5 hover:bg-card/88",
                )}
                key={sim.id}
                onClick={() => onSelectSimulation(sim.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSimulation(sim.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          statusColors[sim.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {sim.status}
                      </span>
                      <Badge variant="outline">{sim.agent_count} agents</Badge>
                      <Badge variant="outline">{sim.generator_kind.replace("_", " ")}</Badge>
                    </div>
                    <strong className="block text-lg text-foreground">{sim.name}</strong>
                    {sim.description ? (
                      <p className="text-sm text-muted-foreground line-clamp-2">{sim.description}</p>
                    ) : null}
                  </div>

                  <Button
                    aria-label={`Delete ${sim.name}`}
                    disabled={deletePendingId === sim.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSimulation(sim.id);
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {sim.status === "completed" ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-xs text-muted-foreground">Best Sharpe</span>
                      <span className="text-sm font-semibold">{formatSharpe(sim.best_sharpe)}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Median Sharpe</span>
                      <span className="text-sm font-semibold">{formatSharpe(sim.median_sharpe)}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Best ROI</span>
                      <span className="text-sm font-semibold">{formatPercent(sim.best_roi)}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Median ROI</span>
                      <span className="text-sm font-semibold">{formatPercent(sim.median_roi)}</span>
                    </div>
                  </div>
                ) : sim.status === "running" ? (
                  <div className="mt-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${sim.agent_count ? (sim.completed_count / sim.agent_count) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {sim.completed_count} / {sim.agent_count} agents
                    </span>
                  </div>
                ) : sim.status === "failed" ? (
                  <p className="mt-3 text-sm text-destructive">{sim.error_message ?? "Simulation failed."}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
