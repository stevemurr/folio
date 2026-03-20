import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, CandlestickChart, FolderPlus, PanelLeft, Settings2, Trash2, X } from "lucide-react";

import { ApiClientError, api, PositionWithMetrics } from "./api/client";
import AddPositionModal from "./components/AddPositionModal";
import AgentSidebar from "./components/AgentSidebar";
import CreatePortfolioModal, {
  CreatePortfolioState,
  initialCreatePortfolioState,
} from "./components/CreatePortfolioModal";
import Dashboard from "./components/Dashboard";
import PositionDrawer from "./components/PositionDrawer";
import SettingsModal from "./components/SettingsModal";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { useAppSettings, useBootstrap, usePortfolio, usePortfolios } from "./hooks/usePortfolio";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function sharpe(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

export default function App() {
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap();
  const settingsQuery = useAppSettings();
  const portfoliosQuery = usePortfolios();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreatePortfolioState>(initialCreatePortfolioState);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPortfolioRail, setShowPortfolioRail] = useState(false);
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
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
      setCreateState(initialCreatePortfolioState);
      setCreateError(null);
      setShowCreateModal(false);
      setShowPortfolioRail(false);
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
       setShowAgentDrawer(false);
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

  const portfolioReady = Boolean(
    selectedPortfolioId && portfolio.detail.data && portfolio.timeseries.data && portfolio.allocation.data,
  );
  const portfolioLoading = Boolean(selectedPortfolioId) && portfolio.isLoading;
  const portfolioErrored =
    Boolean(selectedPortfolioId) &&
    (portfolio.detail.isError || portfolio.timeseries.isError || portfolio.allocation.isError);
  const agentConfigured = Boolean(bootstrapQuery.data?.capabilities.agent);
  const currentValue = portfolio.detail.data?.metrics.total_value ?? selectedSummary?.initial_cash ?? 0;
  const openPositions = portfolio.detail.data?.metrics.open_position_count ?? selectedSummary?.open_positions ?? 0;

  const portfolioRailContent = (
    <div className="flex h-full flex-col gap-4 rounded-[24px] border border-border/80 bg-[linear-gradient(180deg,rgba(15,18,23,0.98),rgba(10,13,17,0.98))] p-4 shadow-panel">
      <div className="space-y-4 border-b border-white/5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-[10px] border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Folio Desk
          </div>
          <Button
            disabled={settingsQuery.isLoading || settingsQuery.isError}
            onClick={() => setShowSettingsModal(true)}
            size="icon"
            variant="ghost"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-[2.25rem] leading-none text-foreground">Replay Terminal</CardTitle>
          <CardDescription className="leading-6 text-muted-foreground">
            A darker, tighter desk built around replays, decisions, and the state of the book.
          </CardDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <Button className="w-full justify-start" onClick={() => setShowCreateModal(true)}>
            <FolderPlus className="h-4 w-4" />
            New Portfolio
          </Button>
          <Button className="w-full justify-start" onClick={() => setShowAgentDrawer(true)} variant="secondary">
            <Bot className="h-4 w-4" />
            {agentConfigured ? "Open Analysis" : "Analysis Setup"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Active Books
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Switch desks or start a fresh run.</p>
          </div>
          <Badge variant="outline">{portfoliosQuery.data?.length ?? 0}</Badge>
        </div>

        <div className="space-y-2">
          {portfoliosQuery.data?.map((portfolioItem) => (
            <button
              className={[
                "w-full rounded-[16px] border px-4 py-3 text-left transition-all",
                portfolioItem.id === selectedPortfolioId
                  ? "border-secondary/35 bg-secondary/14 text-foreground shadow-[0_0_0_1px_rgba(93,215,224,0.15)]"
                  : "border-white/6 bg-white/[0.03] hover:bg-white/[0.06]",
              ].join(" ")}
              key={portfolioItem.id}
              onClick={() => {
                setSelectedPortfolioId(portfolioItem.id);
                setActivePosition(null);
                setShowPortfolioRail(false);
              }}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <strong className="block text-base">{portfolioItem.name}</strong>
                <span className="font-mono text-xs text-muted-foreground">{portfolioItem.open_positions}</span>
              </div>
              <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-muted-foreground">
                open positions
              </span>
            </button>
          ))}
          {!portfoliosQuery.data?.length ? (
            <p className="rounded-[16px] border border-dashed border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-muted-foreground">
              No portfolios yet. Open a new desk to begin replaying positions.
            </p>
          ) : null}
        </div>
      </div>

      {selectedSummary ? (
        <div className="mt-auto rounded-[18px] border border-white/6 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Focused Desk</p>
              <h3 className="font-display text-2xl leading-none">{selectedSummary.name}</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {selectedSummary.description || "Historical replay active."}
              </p>
            </div>
            <Badge variant="secondary">{openPositions} open</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-white/6 bg-background/55 px-4 py-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Desk Value
              </span>
              <strong className="mt-2 block font-mono text-xl">{money.format(currentValue)}</strong>
            </div>
            <div className="rounded-[14px] border border-white/6 bg-background/55 px-4 py-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Sharpe
              </span>
              <strong className="mt-2 block font-mono text-xl">{sharpe(portfolio.detail.data?.metrics.sharpe_ratio)}</strong>
            </div>
          </div>
          <Button
            className="mt-4 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={deleteMutation.isPending || !selectedPortfolioId}
            onClick={() => deleteMutation.mutate()}
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
            {deleteMutation.isPending ? "Deleting..." : "Delete Portfolio"}
          </Button>
        </div>
      ) : null}
    </div>
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
    <main className="min-h-screen px-3 py-3 text-foreground sm:px-4 lg:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1680px] gap-4">
        <aside className="hidden w-[19rem] shrink-0 xl:flex">{portfolioRailContent}</aside>

        <div className="min-w-0 flex-1 space-y-4">
          <header className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-[rgba(10,14,18,0.78)] px-4 py-3 shadow-panel backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
              <Button className="xl:hidden" onClick={() => setShowPortfolioRail(true)} size="sm" variant="outline">
                <PanelLeft className="h-4 w-4" />
                Portfolios
              </Button>
              <div className="min-w-0 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Session Live</Badge>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Trading Desk
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedSummary ? selectedSummary.name : "No active portfolio"}
                  </p>
                </div>
                {selectedSummary ? (
                  <div className="hidden items-center gap-2 rounded-[12px] border border-white/6 bg-white/[0.03] px-3 py-2 md:flex">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Desk Value</span>
                    <span className="font-mono text-sm text-foreground">{money.format(currentValue)}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge className="hidden sm:inline-flex" variant={agentConfigured ? "secondary" : "outline"}>
                {agentConfigured ? "Agent Configured" : "Setup Required"}
              </Badge>
              <Button onClick={() => setShowCreateModal(true)} size="sm" variant="outline">
                <FolderPlus className="h-4 w-4" />
                New Portfolio
              </Button>
              <Button onClick={() => setShowAgentDrawer(true)} size="sm" variant="secondary">
                <Bot className="h-4 w-4" />
                {agentConfigured ? "Open Analysis" : "Analysis Setup"}
              </Button>
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
          </header>

          <section className="min-w-0">
            {!portfoliosQuery.data?.length ? (
              <Card className="grid min-h-[72vh] place-items-center border-white/8 bg-[linear-gradient(180deg,rgba(15,19,24,0.95),rgba(11,14,18,0.98))]">
                <CardContent className="max-w-2xl px-6 py-16 text-center">
                  <div className="mx-auto mb-5 inline-flex rounded-[16px] border border-secondary/20 bg-secondary/10 p-4 text-secondary">
                    <CandlestickChart className="h-8 w-8" />
                  </div>
                  <div className="mb-3 inline-flex items-center rounded-[10px] border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Terminal Ready
                  </div>
                  <h1 className="text-balance text-4xl leading-tight sm:text-5xl">
                    Open a book and light up the replay desk.
                  </h1>
                  <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                    Start a paper portfolio, stage your first position, and watch the book evolve against historical
                    market data.
                  </p>
                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Button onClick={() => setShowCreateModal(true)} size="lg">
                      <FolderPlus className="h-4 w-4" />
                      New Portfolio
                    </Button>
                    <Button onClick={() => setShowAgentDrawer(true)} size="lg" variant="secondary">
                      <Bot className="h-4 w-4" />
                      {agentConfigured ? "Open Analysis" : "Review Agent Setup"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : portfolioLoading ? (
              <Card className="grid min-h-[72vh] place-items-center border-white/8 bg-[linear-gradient(180deg,rgba(15,19,24,0.95),rgba(11,14,18,0.98))]">
                <CardContent className="px-6 py-16 text-center">
                  <p className="text-lg font-medium text-foreground/80">Loading portfolio desk...</p>
                </CardContent>
              </Card>
            ) : portfolioErrored ? (
              <Card className="grid min-h-[72vh] place-items-center border-white/8 bg-[linear-gradient(180deg,rgba(15,19,24,0.95),rgba(11,14,18,0.98))]">
                <CardContent className="max-w-lg px-6 py-16 text-center">
                  <p className="text-lg font-medium text-destructive">Unable to load the selected portfolio.</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Refresh the page or pick a different portfolio from the desk rail.
                  </p>
                </CardContent>
              </Card>
            ) : portfolioReady ? (
              <Dashboard
                allocation={portfolio.allocation.data!}
                bootstrap={bootstrapQuery.data}
                detail={portfolio.detail.data!}
                onAddPosition={() => setShowAddModal(true)}
                onSelectPosition={setActivePosition}
                onToggleBenchmark={() => setShowBenchmark((current) => !current)}
                showBenchmark={showBenchmark}
                timeseries={portfolio.timeseries.data!}
              />
            ) : (
              <Card className="grid min-h-[72vh] place-items-center border-white/8 bg-[linear-gradient(180deg,rgba(15,19,24,0.95),rgba(11,14,18,0.98))]">
                <CardContent className="max-w-lg px-6 py-16 text-center">
                  <p className="text-lg font-medium text-foreground/80">Select a portfolio to open the desk.</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>

      {showPortfolioRail ? (
        <div className="fixed inset-0 z-30 xl:hidden">
          <button
            aria-label="Close portfolio rail"
            className="absolute inset-0 bg-[rgba(29,23,19,0.45)] backdrop-blur-sm"
            onClick={() => setShowPortfolioRail(false)}
            type="button"
          />
          <aside className="absolute inset-y-3 left-3 w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between rounded-[18px] border border-white/8 bg-[rgba(10,14,18,0.92)] px-4 py-3 shadow-panel">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Navigation
                </div>
                <p className="text-sm font-semibold">Portfolio Rail</p>
              </div>
              <Button aria-label="Close portfolios" onClick={() => setShowPortfolioRail(false)} size="icon" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {portfolioRailContent}
          </aside>
        </div>
      ) : null}

      <CreatePortfolioModal
        error={createError}
        onChange={setCreateState}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(event) => {
          event.preventDefault();
          setCreateError(null);
          createMutation.mutate();
        }}
        open={showCreateModal}
        pending={createMutation.isPending}
        state={createState}
      />

      <AgentSidebar
        bootstrap={bootstrapQuery.data}
        onClose={() => setShowAgentDrawer(false)}
        open={showAgentDrawer}
        portfolioId={selectedPortfolioId}
      />

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
