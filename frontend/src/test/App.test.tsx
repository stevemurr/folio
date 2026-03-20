import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";

function bootstrapPayload(agentEnabled = false) {
  return {
    risk_free_rate: 4.25,
    benchmark_ticker: "SPY",
    capabilities: { agent: agentEnabled, real_estate: false },
  };
}

function appSettingsPayload(agentEnabled = false) {
  return {
    database: { engine: "sqlite", path: "~/.folio/folio.db" },
    market: { risk_free_rate: 4.25, benchmark_ticker: "SPY", cache_ttl_days: 1 },
    agent: { endpoint: "", model: "llama3.2", api_key: "none", max_tokens: 2048, temperature: 0.3 },
    scheduler: { enabled: false, price_refresh_cron: "0 18 * * 1-5", zillow_refresh_cron: "0 9 1 * *" },
    real_estate: {
      enabled: false,
      metro_csv_url: "",
      zip_csv_url: "",
      cache_ttl_days: 31,
      search_limit: 20,
    },
    capabilities: { agent: agentEnabled, real_estate: false },
  };
}

function corePortfolioSummary() {
  return {
    id: "p1",
    name: "Core",
    description: "Main sim",
    created_at: "2026-01-01T00:00:00Z",
    base_currency: "USD",
    initial_cash: 10000,
    open_positions: 1,
    total_positions: 1,
  };
}

function corePortfolioDetail() {
  return {
    id: "p1",
    name: "Core",
    description: "Main sim",
    created_at: "2026-01-01T00:00:00Z",
    base_currency: "USD",
    initial_cash: 10000,
    metrics: {
      portfolio_id: "p1",
      total_value: 12000,
      current_cash: 2500,
      simple_roi: 0.2,
      annualized_return: 0.16,
      sharpe_ratio: 1.5,
      benchmark_sharpe_ratio: 1.1,
      relative_sharpe: 0.4,
      alpha: 0.04,
      beta: 0.9,
      benchmark_return: 0.12,
      benchmark_ticker: "SPY",
      risk_free_rate: 4.25,
      position_count: 1,
      open_position_count: 1,
    },
    positions: [
      {
        id: "pos1",
        portfolio_id: "p1",
        asset_type: "stock",
        ticker: "NVDA",
        shares: 3,
        entry_price: 100,
        entry_date: "2026-01-02",
        exit_price: null,
        exit_date: null,
        notes: "",
        status: "open",
        current_price: 150,
        current_value: 450,
        dollar_pnl: 150,
        simple_roi: 0.5,
        annualized_return: 0.5,
        sharpe_ratio: 1.9,
        weight: 0.0375,
      },
    ],
  };
}

function coreTimeseries() {
  return [
    { date: "2026-01-02", portfolio_value: 10000, cash: 9700, benchmark_value: 10000 },
    { date: "2026-01-03", portfolio_value: 12000, cash: 2500, benchmark_value: 11100 },
  ];
}

function coreAllocation() {
  return [
    { label: "Cash", ticker: "CASH", value: 2500, weight: 0.2083 },
    { label: "NVDA", ticker: "NVDA", value: 450, weight: 0.0375 },
  ];
}

function dashboardPayloads(agentEnabled = false) {
  return {
    "GET /api/v1/app/bootstrap": bootstrapPayload(agentEnabled),
    "GET /api/v1/app/settings": appSettingsPayload(agentEnabled),
    "GET /api/v1/portfolios": [corePortfolioSummary()],
    "GET /api/v1/portfolios/p1": corePortfolioDetail(),
    "GET /api/v1/portfolios/p1/timeseries": coreTimeseries(),
    "GET /api/v1/portfolios/p1/allocation": coreAllocation(),
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(payloads: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    if (!(key in payloads)) {
      return jsonResponse({ detail: { code: "missing", message: key } }, 404);
    }
    return jsonResponse(
      payloads[key],
      key.startsWith("DELETE") ? 204 : key.startsWith("POST /api/v1/portfolios") ? 201 : 200,
    );
  }) as typeof fetch;
}

function renderApp() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the empty desk state without the inline create form", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": bootstrapPayload(),
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [],
    });

    renderApp();

    expect(await screen.findByText(/Open a book and light up the replay desk/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Name/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /New Portfolio/i }).length).toBeGreaterThan(0);
  });

  it("renders the desk workspace and keeps analysis collapsed by default", async () => {
    mockFetch(dashboardPayloads());

    renderApp();

    expect(await screen.findByText(/Portfolio Replay/i)).toBeInTheDocument();
    expect(screen.getByText(/Desk Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Holdings/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Portfolio Analyst/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Hide SPY/i }));
    expect(screen.getByRole("button", { name: /Show SPY/i })).toBeInTheDocument();
  });

  it("submits the create portfolio modal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (method === "GET" && url === "/api/v1/app/bootstrap") {
        return jsonResponse(bootstrapPayload());
      }
      if (method === "GET" && url === "/api/v1/app/settings") {
        return jsonResponse(appSettingsPayload());
      }
      if (method === "GET" && url === "/api/v1/portfolios") {
        return jsonResponse([]);
      }
      if (method === "POST" && url === "/api/v1/portfolios") {
        return jsonResponse(
          {
            id: "created",
            name: "Test",
            description: "",
            created_at: "2026-01-01T00:00:00Z",
            base_currency: "USD",
            initial_cash: 5000,
            open_positions: 0,
            total_positions: 0,
          },
          201,
        );
      }
      if (method === "GET" && url === "/api/v1/portfolios/created") {
        return jsonResponse({
          id: "created",
          name: "Test",
          description: "",
          created_at: "2026-01-01T00:00:00Z",
          base_currency: "USD",
          initial_cash: 5000,
          metrics: {
            portfolio_id: "created",
            total_value: 5000,
            current_cash: 5000,
            simple_roi: 0,
            annualized_return: null,
            sharpe_ratio: null,
            benchmark_sharpe_ratio: null,
            relative_sharpe: null,
            alpha: null,
            beta: null,
            benchmark_return: null,
            benchmark_ticker: "SPY",
            risk_free_rate: 4.25,
            position_count: 0,
            open_position_count: 0,
          },
          positions: [],
        });
      }
      if (method === "GET" && url === "/api/v1/portfolios/created/timeseries") {
        return jsonResponse([]);
      }
      if (method === "GET" && url === "/api/v1/portfolios/created/allocation") {
        return jsonResponse([{ label: "Cash", ticker: "CASH", value: 5000, weight: 1 }]);
      }
      return jsonResponse({ detail: { code: "missing", message: `${method} ${url}` } }, 404);
    });

    globalThis.fetch = fetchMock as typeof fetch;
    renderApp();

    fireEvent.click((await screen.findAllByRole("button", { name: /New Portfolio/i }))[0]);
    expect(await screen.findByRole("heading", { name: /Open A New Desk/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create Portfolio$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/portfolios",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("opens the analysis drawer from the collapsed desk affordance", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": bootstrapPayload(),
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [],
    });

    renderApp();

    fireEvent.click((await screen.findAllByRole("button", { name: /Analysis Setup/i }))[0]);

    expect(await screen.findByRole("heading", { name: /Portfolio Analyst/i })).toBeInTheDocument();
    expect(screen.getByText(/Agent tools stay hidden until the endpoint is configured/i)).toBeInTheDocument();
  });

  it("opens the position drawer from holdings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const key = `${method} ${url}`;

      const payloads: Record<string, unknown> = dashboardPayloads();
      if (key in payloads) {
        return jsonResponse(payloads[key]);
      }

      if (method === "GET" && url.startsWith("/api/v1/market/history/NVDA?")) {
        return jsonResponse([
          { date: "2026-01-02", open: 98, high: 101, low: 97, close: 100, volume: 1000 },
          { date: "2026-01-03", open: 120, high: 151, low: 119, close: 150, volume: 1200 },
        ]);
      }

      return jsonResponse({ detail: { code: "missing", message: key } }, 404);
    });

    globalThis.fetch = fetchMock as typeof fetch;
    renderApp();

    fireEvent.click(await screen.findByRole("cell", { name: /NVDA open/i }));

    expect(await screen.findByRole("heading", { name: /^NVDA$/i })).toBeInTheDocument();
    expect(screen.getByText(/position detail/i)).toBeInTheDocument();
  });

  it("opens the runtime settings modal", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": bootstrapPayload(),
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [],
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /Settings/i }));
    expect(await screen.findByRole("heading", { name: /Runtime Settings/i })).toBeInTheDocument();
  });
});
