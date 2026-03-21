import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, X } from "lucide-react";

import { WorkspaceDetail, api } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type WorkspacePhase = "books" | "run";

type Props = {
  booksCount: number;
  onAddBenchmark: (ticker: string) => void;
  onReturnToBooks: () => void;
  onRunSimulation: () => void;
  onSaveBankroll: (nextValue: number) => void;
  onSetPrimaryBenchmark: (ticker: string) => void;
  onRemoveBenchmark: (ticker: string) => void;
  phase: WorkspacePhase;
  pendingWorkspaceUpdate: boolean;
  workspace: WorkspaceDetail;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function WorkspaceHero({
  booksCount,
  onAddBenchmark,
  onReturnToBooks,
  onRunSimulation,
  onSaveBankroll,
  onSetPrimaryBenchmark,
  onRemoveBenchmark,
  phase,
  pendingWorkspaceUpdate,
  workspace,
}: Props) {
  const [editingBankroll, setEditingBankroll] = useState(false);
  const [bankrollInput, setBankrollInput] = useState(String(Math.round(workspace.initial_cash)));
  const [benchmarkQuery, setBenchmarkQuery] = useState("");
  const [debouncedBenchmarkQuery, setDebouncedBenchmarkQuery] = useState("");

  useEffect(() => {
    setBankrollInput(String(Math.round(workspace.initial_cash)));
  }, [workspace.initial_cash]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedBenchmarkQuery(benchmarkQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [benchmarkQuery]);

  const benchmarkSearchQuery = useQuery({
    queryFn: ({ signal }) => api.searchMarket(debouncedBenchmarkQuery, signal),
    queryKey: ["workspace-benchmark-search", debouncedBenchmarkQuery],
    enabled: debouncedBenchmarkQuery.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  function submitBankroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(bankrollInput.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onSaveBankroll(parsed);
    setEditingBankroll(false);
  }

  function addBenchmark(ticker: string) {
    onAddBenchmark(ticker);
    setBenchmarkQuery("");
    setDebouncedBenchmarkQuery("");
  }

  return (
    <Card className="surface-panel border-border/80 shadow-panel">
      <CardHeader className="gap-5 border-b border-border/60 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Workspace</Badge>
              <Badge variant="outline">
                {booksCount} {booksCount === 1 ? "book" : "books"}
              </Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl leading-[0.95] sm:text-4xl">{workspace.name}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {phase === "books"
                  ? "Set the bankroll, choose the benchmark overlays, and build the books for this run."
                  : "The replay is loaded at the opening date and stays paused until you hit Play."}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {phase === "run" ? (
              <Button onClick={onReturnToBooks} variant="secondary">
                Back to Books
              </Button>
            ) : (
              <Button disabled={!booksCount} onClick={onRunSimulation}>
                Run Simulation
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 pt-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Shared Bankroll
              </span>
              {!editingBankroll ? (
                <strong className="mt-2 block font-mono text-lg">{formatCurrency(workspace.initial_cash)}</strong>
              ) : null}
            </div>
            {!editingBankroll ? (
              <Button
                aria-label="Edit bankroll"
                disabled={pendingWorkspaceUpdate}
                onClick={() => setEditingBankroll(true)}
                size="icon"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {editingBankroll ? (
            <form className="mt-3 grid gap-3" onSubmit={submitBankroll}>
              <Input inputMode="decimal" onChange={(event) => setBankrollInput(event.target.value)} value={bankrollInput} />
              <div className="flex items-center gap-2">
                <Button disabled={pendingWorkspaceUpdate} size="sm" type="submit">
                  {pendingWorkspaceUpdate ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => {
                    setEditingBankroll(false);
                    setBankrollInput(String(Math.round(workspace.initial_cash)));
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Changing bankroll reseeds every book and resets the run to the start.
            </p>
          )}
        </div>

        <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Benchmarks
              </span>
              <strong className="mt-2 block text-lg">
                {workspace.benchmarks.find((item) => item.is_primary)?.ticker ?? "None"}
              </strong>
            </div>
            {pendingWorkspaceUpdate ? <LoaderCircle className="mt-1 h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {workspace.benchmarks.map((benchmark) => (
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]",
                  benchmark.is_primary
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border/70 bg-background/75 text-foreground",
                )}
                key={benchmark.ticker}
              >
                <button
                  className="transition-colors hover:text-primary"
                  onClick={() => onSetPrimaryBenchmark(benchmark.ticker)}
                  type="button"
                >
                  {benchmark.ticker}
                </button>
                {benchmark.is_primary ? <Check className="h-3.5 w-3.5" /> : null}
                {workspace.benchmarks.length > 1 ? (
                  <button
                    aria-label={`Remove benchmark ${benchmark.ticker}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemoveBenchmark(benchmark.ticker)}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            <label className="sr-only" htmlFor="benchmark-search">
              Add benchmark
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="benchmark-search"
                onChange={(event) => setBenchmarkQuery(event.target.value)}
                placeholder="Add benchmark ticker"
                value={benchmarkQuery}
              />
              <Button
                disabled={!benchmarkQuery.trim()}
                onClick={() => addBenchmark(benchmarkQuery.trim().toUpperCase())}
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {benchmarkSearchQuery.data?.length ? (
              <div className="flex flex-wrap gap-2">
                {benchmarkSearchQuery.data.slice(0, 5).map((result) => (
                  <button
                    className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-secondary/25 hover:text-secondary"
                    key={result.ticker}
                    onClick={() => addBenchmark(result.ticker)}
                    type="button"
                  >
                    {result.ticker}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Click a chip to make it primary. Additional benchmarks only add chart overlays.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
