import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiClientError, api, PositionWithMetrics } from "./api/client";
import AddPositionModal from "./components/AddPositionModal";
import AgentSidebar from "./components/AgentSidebar";
import Dashboard from "./components/Dashboard";
import PositionDrawer from "./components/PositionDrawer";
import { useBootstrap, usePortfolio, usePortfolios } from "./hooks/usePortfolio";

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
  const portfoliosQuery = usePortfolios();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreatePortfolioState>(initialPortfolioState);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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
    return <main className="app-shell loading">Loading Folio...</main>;
  }

  if (bootstrapQuery.isError || !bootstrapQuery.data) {
    return <main className="app-shell loading">Unable to load app bootstrap configuration.</main>;
  }

  return (
    <main className="app-shell">
      <aside className="portfolio-rail">
        <div className="brand-lockup">
          <span className="eyebrow">Folio</span>
          <h1>Virtual investing with replayable history</h1>
        </div>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Portfolios</h2>
              <p>Select a portfolio or create a new one.</p>
            </div>
          </div>
          <div className="portfolio-list">
            {portfoliosQuery.data?.map((portfolioItem) => (
              <button
                className={portfolioItem.id === selectedPortfolioId ? "portfolio-pill active" : "portfolio-pill"}
                key={portfolioItem.id}
                onClick={() => {
                  setSelectedPortfolioId(portfolioItem.id);
                  setActivePosition(null);
                }}
                type="button"
              >
                <strong>{portfolioItem.name}</strong>
                <span>{portfolioItem.open_positions} open positions</span>
              </button>
            ))}
            {!portfoliosQuery.data?.length ? <p className="empty-copy">No portfolios yet.</p> : null}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Create Portfolio</h2>
              <p>Start with a strict cash balance and historical replay.</p>
            </div>
          </div>
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              setCreateError(null);
              createMutation.mutate();
            }}
          >
            <label>
              Name
              <input
                value={createState.name}
                onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                placeholder="Core Portfolio"
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={createState.description}
                onChange={(event) =>
                  setCreateState((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Focus on semi growth with broad-market ballast."
              />
            </label>
            <label>
              Initial Cash
              <input
                inputMode="decimal"
                value={createState.initialCash}
                onChange={(event) =>
                  setCreateState((current) => ({ ...current, initialCash: event.target.value }))
                }
              />
            </label>
            {createError ? <p className="error-banner">{createError}</p> : null}
            <button className="primary-button" disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Portfolio"}
            </button>
          </form>
        </section>
      </aside>

      <section className="main-stage">
        {selectedPortfolioId && portfolio.detail.data && portfolio.timeseries.data && portfolio.allocation.data ? (
          <>
            <div className="top-strip">
              <div className="selection-meta">
                <strong>{selectedSummary?.name}</strong>
                <span>{selectedSummary?.description || "Historical portfolio replay active."}</span>
              </div>
              <button
                className="secondary-button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                type="button"
              >
                Delete Portfolio
              </button>
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
          <section className="empty-stage">
            <span className="eyebrow">Ready to Simulate</span>
            <h2>Create a portfolio to begin replaying historical positions.</h2>
            <p>Once a portfolio exists, you can add stock or ETF positions with strict cash enforcement.</p>
          </section>
        )}
      </section>

      <AgentSidebar bootstrap={bootstrapQuery.data} />

      {selectedPortfolioId ? (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          open={showAddModal}
          portfolioId={selectedPortfolioId}
        />
      ) : null}
      <PositionDrawer onClose={() => setActivePosition(null)} position={activePosition} />
    </main>
  );
}

