import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, Trash2, X } from "lucide-react";

import { BookConfig, api, BookCreateRequest, MarketSearchResult, WorkspaceAvailabilityResponse } from "../api/client";
import { cn } from "../lib/utils";
import { GUIDED_RUN_PRESETS, presetById, weightsForPreset } from "../lib/guidedRun";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import ModalShell from "./ui/modal-shell";
import { Textarea } from "./ui/textarea";

type CustomAllocation = {
  ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  weight: string;
};

type Props = {
  collectionName?: string | null;
  config: BookConfig | null;
  error: string | null;
  loadingConfig?: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (payload: BookCreateRequest) => void;
  open: boolean;
  pending: boolean;
  workspaceId: string | null;
};

function initialPresetWeights(presetId: string) {
  return weightsForPreset(presetById(presetId));
}

function parseWeight(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateWeights(weights: number[]): string | null {
  if (weights.some((weight) => weight < 0)) {
    return "Book weights cannot be negative.";
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight > 100) {
    return "Book weights cannot exceed 100%.";
  }
  if (!weights.some((weight) => weight > 0)) {
    return "Add at least one allocation with weight greater than zero.";
  }
  return null;
}

function customAllocationsFromConfig(config: BookConfig): CustomAllocation[] {
  return config.allocations.map((allocation) => ({
    ticker: allocation.ticker,
    name: allocation.ticker,
    asset_type: allocation.asset_type,
    weight: String(allocation.weight),
  }));
}

function presetWeightsFromConfig(config: BookConfig, presetId: string) {
  const preset = presetById(presetId);
  const weights = initialPresetWeights(presetId);
  for (const allocation of config.allocations) {
    if (preset.allocations.some((item) => item.ticker === allocation.ticker)) {
      weights[allocation.ticker] = String(allocation.weight);
    }
  }
  return weights;
}

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

function availabilityMessage(data: WorkspaceAvailabilityResponse | undefined): string | null {
  if (!data) {
    return null;
  }
  if (data.issues.length) {
    return data.issues[0].message;
  }
  const blocked = data.tickers.find((item) => !item.available);
  if (!blocked) {
    return null;
  }
  if (blocked.first_tradable_date) {
    return `${blocked.ticker} first becomes tradable on ${blocked.first_tradable_date}.`;
  }
  return `${blocked.ticker} has no market data for the shared opening session.`;
}

export default function CreateBookModal({
  collectionName,
  config,
  error,
  loadingConfig = false,
  mode,
  onClose,
  onSubmit,
  open,
  pending,
  workspaceId,
}: Props) {
  const [strategyMode, setStrategyMode] = useState<"preset" | "custom">("preset");
  const [presetId, setPresetId] = useState(GUIDED_RUN_PRESETS[0].id);
  const [presetWeights, setPresetWeights] = useState<Record<string, string>>(() => initialPresetWeights(GUIDED_RUN_PRESETS[0].id));
  const [customAllocations, setCustomAllocations] = useState<CustomAllocation[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [name, setName] = useState(GUIDED_RUN_PRESETS[0].name);
  const [description, setDescription] = useState(GUIDED_RUN_PRESETS[0].description);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStrategyMode("preset");
      setPresetId(GUIDED_RUN_PRESETS[0].id);
      setPresetWeights(initialPresetWeights(GUIDED_RUN_PRESETS[0].id));
      setCustomAllocations([]);
      setQuery("");
      setDebouncedQuery("");
      setName(GUIDED_RUN_PRESETS[0].name);
      setDescription(GUIDED_RUN_PRESETS[0].description);
      setLocalError(null);
      return;
    }

    if (mode === "edit" && config) {
      setStrategyMode(config.strategy_kind === "preset" ? "preset" : "custom");
      const activePresetId = config.preset_id ?? GUIDED_RUN_PRESETS[0].id;
      setPresetId(activePresetId);
      setPresetWeights(presetWeightsFromConfig(config, activePresetId));
      setCustomAllocations(customAllocationsFromConfig(config));
      setName(config.name);
      setDescription(config.description);
      setLocalError(null);
      return;
    }

    if (mode === "create") {
      setStrategyMode("preset");
      setPresetId(GUIDED_RUN_PRESETS[0].id);
      setPresetWeights(initialPresetWeights(GUIDED_RUN_PRESETS[0].id));
      setCustomAllocations([]);
      setName(GUIDED_RUN_PRESETS[0].name);
      setDescription(GUIDED_RUN_PRESETS[0].description);
      setLocalError(null);
    }
  }, [config, mode, open]);

  useEffect(() => {
    if (!open || strategyMode !== "custom") {
      setDebouncedQuery("");
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, strategyMode]);

  const searchQuery = useQuery({
    queryFn: async ({ signal }): Promise<MarketSearchResult[]> => api.searchMarket(debouncedQuery, signal),
    queryKey: ["book-market-search", debouncedQuery],
    enabled: open && strategyMode === "custom" && debouncedQuery.length >= 1,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const preset = presetById(presetId);
  const presetAllocationRows = useMemo(
    () =>
      preset.allocations.map((allocation) => ({
        ...allocation,
        weight: parseWeight(presetWeights[allocation.ticker] ?? "0"),
      })),
    [preset, presetWeights],
  );
  const presetCashWeight = 100 - presetAllocationRows.reduce((sum, item) => sum + item.weight, 0);
  const customCashWeight = 100 - customAllocations.reduce((sum, item) => sum + parseWeight(item.weight), 0);
  const activeTickers = useMemo(() => {
    const tickers =
      strategyMode === "preset"
        ? presetAllocationRows.filter((allocation) => allocation.weight > 0).map((allocation) => allocation.ticker)
        : customAllocations
            .filter((allocation) => parseWeight(allocation.weight) > 0)
            .map((allocation) => allocation.ticker);
    return [...new Set(tickers)].sort();
  }, [customAllocations, presetAllocationRows, strategyMode]);
  const availabilityQuery = useQuery({
    queryFn: ({ signal }) => api.getWorkspaceAvailability(workspaceId!, activeTickers, signal),
    queryKey: ["workspace-availability", workspaceId, activeTickers],
    enabled: open && Boolean(workspaceId) && activeTickers.length > 0,
    retry: false,
    staleTime: 60 * 1000,
  });
  const availabilityByTicker = useMemo(
    () => Object.fromEntries((availabilityQuery.data?.tickers ?? []).map((item) => [item.ticker, item])),
    [availabilityQuery.data?.tickers],
  );
  const availabilityError = availabilityMessage(availabilityQuery.data);
  const availabilityBlocked = Boolean(availabilityError);
  const openingSession = availabilityQuery.data?.opening_session ?? null;

  if (!open) {
    return null;
  }

  function switchPreset(nextPresetId: string) {
    const nextPreset = presetById(nextPresetId);
    setPresetId(nextPreset.id);
    setPresetWeights(initialPresetWeights(nextPreset.id));
    if (mode === "create" || strategyMode !== "preset") {
      setName(nextPreset.name);
      setDescription(nextPreset.description);
    }
    setLocalError(null);
  }

  function addCustomAllocation(result: MarketSearchResult) {
    if (customAllocations.some((item) => item.ticker === result.ticker)) {
      return;
    }
    setCustomAllocations((current) => [
      ...current,
      {
        ticker: result.ticker,
        name: result.name,
        asset_type: result.asset_type,
        weight: "",
      },
    ]);
    setQuery("");
    setDebouncedQuery("");
    setLocalError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const allocations =
      strategyMode === "preset"
        ? presetAllocationRows
            .filter((allocation) => allocation.weight > 0)
            .map(({ ticker, asset_type, weight }) => ({ ticker, asset_type, weight }))
        : customAllocations
            .map((allocation) => ({
              ticker: allocation.ticker,
              asset_type: allocation.asset_type,
              weight: parseWeight(allocation.weight),
            }))
            .filter((allocation) => allocation.weight > 0);

    const validationError = validateWeights(allocations.map((allocation) => allocation.weight));
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    if (!name.trim()) {
      setLocalError("Book name is required.");
      return;
    }
    if (availabilityBlocked) {
      setLocalError(availabilityError ?? "This book cannot launch on the workspace opening session.");
      return;
    }

    setLocalError(null);
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      strategy_kind: strategyMode,
      preset_id: strategyMode === "preset" ? presetId : null,
      allocations,
    });
  }

  return (
    <ModalShell contentClassName="max-w-6xl" open={open}>
      <Card className="surface-panel flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden border-border/80 shadow-panel">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 pb-5">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-[12px] border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                {mode === "edit" ? "Edit Book" : "Add Book"}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl leading-tight sm:text-3xl">
                  {mode === "edit"
                    ? "Edit this strategy."
                    : collectionName
                      ? `Configure a book for ${collectionName}.`
                      : "Configure a book for this collection."}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Choose a preset spread or build a custom basket for this bankroll cohort.
                </CardDescription>
              </div>
            </div>
              <Button aria-label="Close book creation" onClick={onClose} size="icon" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
          </CardHeader>

          <CardContent className="min-h-0 overflow-y-auto pt-6">
            {loadingConfig ? (
              <div className="grid min-h-[320px] place-items-center rounded-[20px] border border-dashed border-border/70 px-6 text-center">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading book configuration...
                </div>
              </div>
            ) : (
              <form className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]" onSubmit={submit}>
                <div className="grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                        strategyMode === "preset"
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-border bg-background/70 text-foreground hover:bg-background",
                      )}
                      onClick={() => setStrategyMode("preset")}
                      type="button"
                    >
                      Preset Spread
                    </button>
                    <button
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                        strategyMode === "custom"
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-border bg-background/70 text-foreground hover:bg-background",
                      )}
                      onClick={() => setStrategyMode("custom")}
                      type="button"
                    >
                      Custom Basket
                    </button>
                  </div>

                  {strategyMode === "preset" ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {GUIDED_RUN_PRESETS.map((item) => {
                        const active = item.id === presetId;
                        return (
                          <button
                            className={cn(
                              "rounded-[18px] border px-4 py-4 text-left transition-all",
                              active
                                ? "border-primary/30 bg-primary/10 shadow-[0_0_0_1px_rgba(242,139,61,0.18)]"
                                : "border-border/70 bg-card/60 hover:bg-card/85",
                            )}
                            key={item.id}
                            onClick={() => switchPreset(item.id)}
                            type="button"
                          >
                            <strong className="block text-lg text-foreground">{item.name}</strong>
                            <span className="mt-2 block text-sm leading-6 text-muted-foreground">{item.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {strategyMode === "preset" ? (
                    <div className="surface-outline grid gap-3 rounded-[20px] border border-border/70 p-4">
                      {presetAllocationRows.map((allocation) => (
                        <div
                          className="surface-panel-soft grid gap-3 rounded-[16px] border border-border/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_9rem]"
                          key={allocation.ticker}
                        >
                          <div>
                            <strong className="block text-base">{allocation.ticker}</strong>
                            <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-muted-foreground">ETF</span>
                            {allocation.weight > 0 && availabilityByTicker[allocation.ticker] ? (
                              <span
                                className={cn(
                                  "mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                  availabilityByTicker[allocation.ticker].available
                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                    : "border-destructive/25 bg-destructive/10 text-destructive",
                                )}
                              >
                                {availabilityByTicker[allocation.ticker].available
                                  ? "Ready At Open"
                                  : availabilityByTicker[allocation.ticker].first_tradable_date
                                    ? `Starts ${availabilityByTicker[allocation.ticker].first_tradable_date}`
                                    : "Unavailable"}
                              </span>
                            ) : null}
                          </div>
                          <label className="grid gap-2 text-sm font-semibold text-foreground">
                            <span className="sr-only">{allocation.ticker} weight</span>
                            <Input
                              inputMode="decimal"
                              min="0"
                              onChange={(event) =>
                                setPresetWeights((current) => ({
                                  ...current,
                                  [allocation.ticker]: event.target.value,
                                }))
                              }
                              step="0.1"
                              value={presetWeights[allocation.ticker] ?? ""}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <label className="grid gap-2 text-sm font-semibold text-foreground">
                        <span>Search stock or ETF</span>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-10"
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search VTI, QQQ, AAPL"
                            value={query}
                          />
                        </div>
                      </label>
                      {searchQuery.data?.length ? (
                        <div className="grid gap-2">
                          {searchQuery.data.map((result) => (
                            <button
                              className="surface-panel-muted flex items-center justify-between rounded-[16px] border border-border/70 px-4 py-4 text-left transition-colors hover:bg-card/80"
                              key={result.ticker}
                              onClick={() => addCustomAllocation(result)}
                              type="button"
                            >
                              <div>
                                <strong className="block">{result.ticker}</strong>
                                <span className="mt-1 block text-sm text-muted-foreground">{result.name}</span>
                              </div>
                              <Badge variant="outline">{result.asset_type}</Badge>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="surface-outline grid gap-3 rounded-[20px] border border-border/70 p-4">
                        {customAllocations.length ? (
                          customAllocations.map((allocation) => (
                            <div
                              className="surface-panel-soft grid gap-3 rounded-[16px] border border-border/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
                              key={allocation.ticker}
                            >
                              <div>
                                <strong className="block text-base">{allocation.ticker}</strong>
                                <span className="mt-1 block text-sm text-muted-foreground">{allocation.name}</span>
                                {parseWeight(allocation.weight) > 0 && availabilityByTicker[allocation.ticker] ? (
                                  <span
                                    className={cn(
                                      "mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                      availabilityByTicker[allocation.ticker].available
                                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                        : "border-destructive/25 bg-destructive/10 text-destructive",
                                    )}
                                  >
                                    {availabilityByTicker[allocation.ticker].available
                                      ? "Ready At Open"
                                      : availabilityByTicker[allocation.ticker].first_tradable_date
                                        ? `Starts ${availabilityByTicker[allocation.ticker].first_tradable_date}`
                                        : "Unavailable"}
                                  </span>
                                ) : null}
                              </div>
                              <label className="grid gap-2 text-sm font-semibold text-foreground">
                                <span className="sr-only">{allocation.ticker} weight</span>
                                <Input
                                  inputMode="decimal"
                                  min="0"
                                  onChange={(event) =>
                                    setCustomAllocations((current) =>
                                      current.map((item) =>
                                        item.ticker === allocation.ticker ? { ...item, weight: event.target.value } : item,
                                      ),
                                    )
                                  }
                                  step="0.1"
                                  value={allocation.weight}
                                />
                              </label>
                              <Button
                                onClick={() =>
                                  setCustomAllocations((current) =>
                                    current.filter((item) => item.ticker !== allocation.ticker),
                                  )
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <div className="surface-panel-soft rounded-[16px] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                            Search and add tickers to build the opening basket.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold text-foreground">
                    <span>Book Name</span>
                    <Input onChange={(event) => setName(event.target.value)} value={name} />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-foreground">
                    <span>Description</span>
                    <Textarea
                      className="min-h-[120px]"
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      value={description}
                    />
                  </label>

                  <div className="surface-panel-soft grid gap-3 rounded-[20px] border border-border/70 p-5">
                    <div className="surface-panel-muted rounded-[16px] border border-border/70 px-4 py-4">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Cash Reserve
                      </span>
                      <strong className="mt-2 block font-mono text-2xl">
                        {(strategyMode === "preset" ? presetCashWeight : customCashWeight).toFixed(1)}%
                      </strong>
                    </div>
                    <div className="surface-panel-soft rounded-[16px] border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
                      {availabilityQuery.isLoading
                        ? "Checking the shared opening session..."
                        : openingSession
                          ? `Every book launches from the shared workspace bankroll on ${formatLongDate(openingSession)}.`
                          : "Every book launches from the shared workspace bankroll."}
                    </div>
                    {availabilityBlocked ? (
                      <p className="rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {availabilityError}
                      </p>
                    ) : null}
                    {localError || error ? (
                      <p className="rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {localError || error}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      <Button
                        className="justify-between"
                        disabled={pending || loadingConfig || availabilityQuery.isLoading || availabilityBlocked}
                        size="lg"
                        type="submit"
                      >
                        <span>{pending ? "Saving..." : mode === "edit" ? "Save Book" : "Create Book"}</span>
                        <span className="font-mono text-xs">{mode === "edit" ? "BOOK*" : "BOOK+"}</span>
                      </Button>
                      <Button onClick={onClose} type="button" variant="ghost">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
      </Card>
    </ModalShell>
  );
}
