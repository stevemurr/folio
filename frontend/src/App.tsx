import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, CandlestickChart, FolderPlus, Settings2, Trash2 } from "lucide-react";

import { ApiClientError, api, PositionWithMetrics } from "./api/client";
import AddPositionModal from "./components/AddPositionModal";
import AgentSidebar from "./components/AgentSidebar";
import Dashboard from "./components/Dashboard";
import PositionDrawer from "./components/PositionDrawer";
import SettingsModal from "./components/SettingsModal";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { useAppSettings, useBootstrap, usePortfolio, usePortfolios } from "./hooks/usePortfolio";

type CreatePortfolioState = {
  name: string;
  description: string;
  initialCash: string;
};

const initialPortfolioState: CreatePortfolioState = {
  name: "",
  description: "",
  initialCash: "10000",
};

export default function App() {
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap();
  const settingsQuery = useAppSettings();
  const portfoliosQuery = usePortfolios();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreatePortfolioState>(initialPortfolioState);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [activePosition, setActivePosition] = useState<PositionWithMetrics | null>(null);

  const portfolio = usePortfolio(selectedPortfolioId);

  useEffect(() => {
    if (!selectedPortfolioId && portfoliosQuery.data?.length) {
      setSelectedPortfolioId(portfoliosQuery.data[0].id);
    }
  }, [portfoliosQuery.data, selectedPortfolioId]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createPortfolio({
        name: createState.name,
        description: createState.description,
        initial_cash: Number(createState.initialCash),
      }),
    onSuccess: async (created) => {
      setCreateState(initialPortfolioState);
      setCreateError(null);
      setSelectedPortfolioId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        setCreateError(error.detail.message);
      } else {
        setCreateError("Unable to create portfolio.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePortfolio(selectedPortfolioId!),
    onSuccess: async () => {
      setSelectedPortfolioId(null);
      setActivePosition(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
        queryClient.removeQueries({ queryKey: ["portfolio"] }),
        queryClient.removeQueries({ queryKey: ["portfolio-timeseries"] }),
        queryClient.removeQueries({ queryKey: ["portfolio-allocation"] }),
      ]);
    },
  });

  const selectedSummary = useMemo(
    () => portfoliosQuery.data?.find((portfolioItem) => portfolioItem.id === selectedPortfolioId) ?? null,
    [portfoliosQuery.data, selectedPortfolioId],
  );

  if (bootstrapQuery.isLoading || portfoliosQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-lg font-medium text-foreground/80">
        Loading Folio...
      </main>
    );
  }

  if (bootstrapQuery.isError || !bootstrapQuery.data) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-lg font-medium text-destructive">
        Unable to load app bootstrap configuration.
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-8 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative grid min-h-[calc(100vh-2.5rem)] gap-5 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]">
        <aside className="min-w-0 space-y-5">
          <Card className="border-primary/15 bg-card/80">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                  Folio
                </div>
                <Button
                  disabled={settingsQuery.isLoading || settingsQuery.isError}
                  onClick={() => setShowSettingsModal(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Settings2 className="h-4 w-4" />
                  Settings
                </Button>
              </div>
              <div className="space-y-3">
                <CardTitle className="text-balance text-4xl leading-[0.95]">
                  Virtual investing with replayable history
                </CardTitle>
                <CardDescription className="max-w-sm text-sm leading-6">
                  Build simulated portfolios, replay them against market data, and inspect risk-adjusted
                  behavior with an embedded agent.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                <CandlestickChart className="h-4 w-4 text-secondary" />
                <span>Stocks and ETFs with historical fill logic</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                <Bot className="h-4 w-4 text-primary" />
                <span>Persistent analysis chat per portfolio</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                <Settings2 className="h-4 w-4 text-accent-foreground" />
                <span>
                  Runtime settings and{" "}
                  {bootstrapQuery.data.capabilities.real_estate ? "Zillow real estate enabled" : "stock-only mode"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portfolios</CardTitle>
              <CardDescription>Select a portfolio or create a new one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {portfoliosQuery.data?.map((portfolioItem) => (
                <button
                  className={[
                    "w-full rounded-3xl border px-4 py-4 text-left transition-colors",
                    portfolioItem.id === selectedPortfolioId
                      ? "border-primary/25 bg-primary text-primary-foreground shadow-[0_18px_36px_rgba(138,76,52,0.22)]"
                      : "border-border/70 bg-background/80 hover:bg-background",
                  ].join(" ")}
                  key={portfolioItem.id}
                  onClick={() => {
                    setSelectedPortfolioId(portfolioItem.id);
                    setActivePosition(null);
                  }}
                  type="button"
                >
                  <strong className="block text-base">{portfolioItem.name}</strong>
                  <span
                    className={
                      portfolioItem.id === selectedPortfolioId
                        ? "mt-1 block text-sm text-primary-foreground/80"
                        : "mt-1 block text-sm text-muted-foreground"
                    }
                  >
                    {portfolioItem.open_positions} open positions
                  </span>
                </button>
              ))}
              {!portfoliosQuery.data?.length ? (
                <p className="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                  No portfolios yet.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Portfolio</CardTitle>
              <CardDescription>Start with a strict cash balance and historical replay.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setCreateError(null);
                  createMutation.mutate();
                }}
              >
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Name</span>
                  <Input
                    value={createState.name}
                    onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Core Portfolio"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Description</span>
                  <Textarea
                    rows={4}
                    value={createState.description}
                    onChange={(event) =>
                      setCreateState((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Focus on semi growth with broad-market ballast."
                    className="min-h-[112px]"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Initial Cash</span>
                  <Input
                    inputMode="decimal"
                    value={createState.initialCash}
                    onChange={(event) =>
                      setCreateState((current) => ({ ...current, initialCash: event.target.value }))
                    }
                  />
                </label>
                {createError ? (
                  <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {createError}
                  </p>
                ) : null}
                <Button className="w-full" disabled={createMutation.isPending} type="submit">
                  <FolderPlus className="h-4 w-4" />
                  {createMutation.isPending ? "Creating..." : "Create Portfolio"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0">
          {selectedPortfolioId && portfolio.detail.data && portfolio.timeseries.data && portfolio.allocation.data ? (
            <>
              <div className="mb-5 flex flex-col gap-4 rounded-[28px] border border-border/70 bg-card/75 px-6 py-5 shadow-panel backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <strong className="block text-lg">{selectedSummary?.name}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {selectedSummary?.description || "Historical portfolio replay active."}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Portfolio
                </Button>
              </div>
              <Dashboard
                allocation={portfolio.allocation.data}
                bootstrap={bootstrapQuery.data}
                detail={portfolio.detail.data}
                onAddPosition={() => setShowAddModal(true)}
                onSelectPosition={setActivePosition}
                onToggleBenchmark={() => setShowBenchmark((current) => !current)}
                showBenchmark={showBenchmark}
                timeseries={portfolio.timeseries.data}
              />
            </>
          ) : (
            <Card className="grid min-h-[60vh] place-items-center bg-card/80">
              <CardContent className="max-w-xl px-6 py-16 text-center">
                <div className="mx-auto mb-5 inline-flex rounded-full border border-primary/20 bg-primary/10 p-4 text-primary">
                  <CandlestickChart className="h-7 w-7" />
                </div>
                <div className="mb-3 inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Ready to Simulate
                </div>
                <h2 className="text-balance text-4xl leading-tight">
                  Create a portfolio to begin replaying historical positions.
                </h2>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  Once a portfolio exists, you can add stock or ETF positions with strict cash enforcement.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <AgentSidebar bootstrap={bootstrapQuery.data} portfolioId={selectedPortfolioId} />
      </div>

      {selectedPortfolioId ? (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          open={showAddModal}
          portfolioId={selectedPortfolioId}
          realEstateEnabled={bootstrapQuery.data.capabilities.real_estate}
        />
      ) : null}
      <PositionDrawer onClose={() => setActivePosition(null)} position={activePosition} />
      <SettingsModal
        onClose={() => setShowSettingsModal(false)}
        open={showSettingsModal}
        settings={settingsQuery.data}
      />
    </main>
  );
}
