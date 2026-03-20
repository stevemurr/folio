import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";

function appSettingsPayload() {
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
    capabilities: { agent: false, real_estate: false },
  };
}

function mockFetch(payloads: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    if (!(key in payloads)) {
      return new Response(JSON.stringify({ detail: { code: "missing", message: key } }), { status: 404 });
    }
    return new Response(JSON.stringify(payloads[key]), {
      status: key.startsWith("DELETE") ? 204 : key.startsWith("POST /api/v1/portfolios") ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
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
    vi.restoreAllMocks();
  });

  it("renders the empty state when no portfolios exist", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": {
        risk_free_rate: 4.25,
        benchmark_ticker: "SPY",
        capabilities: { agent: false, real_estate: false },
      },
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [],
    });

    renderApp();
    expect(await screen.findByText(/Create a portfolio to begin/i)).toBeInTheDocument();
    expect(screen.getByText(/Setup Required/i)).toBeInTheDocument();
  });

  it("renders dashboard data for a selected portfolio", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": {
        risk_free_rate: 4.25,
        benchmark_ticker: "SPY",
        capabilities: { agent: false, real_estate: false },
      },
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [
        {
          id: "p1",
          name: "Core",
          description: "Main sim",
          created_at: "2026-01-01T00:00:00Z",
          base_currency: "USD",
          initial_cash: 10000,
          open_positions: 1,
          total_positions: 1,
        },
      ],
      "GET /api/v1/portfolios/p1": {
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
      },
      "GET /api/v1/portfolios/p1/timeseries": [
        { date: "2026-01-02", portfolio_value: 10000, cash: 9700, benchmark_value: 10000 },
        { date: "2026-01-03", portfolio_value: 12000, cash: 2500, benchmark_value: 11100 },
      ],
      "GET /api/v1/portfolios/p1/allocation": [
        { label: "NVDA", ticker: "NVDA", value: 450, weight: 0.0375 },
        { label: "Cash", ticker: "CASH", value: 2500, weight: 0.2083 },
      ],
    });

    renderApp();
    expect(await screen.findByText(/Portfolio Replay/i)).toBeInTheDocument();
    expect(screen.getByText(/Sharpe Ratio/i)).toBeInTheDocument();
    expect(screen.getAllByText(/NVDA/i).length).toBeGreaterThan(0);
  });

  it("submits the create portfolio form", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (method === "GET" && url === "/api/v1/app/bootstrap") {
        return new Response(
          JSON.stringify({
            risk_free_rate: 4.25,
            benchmark_ticker: "SPY",
            capabilities: { agent: false, real_estate: false },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "GET" && url === "/api/v1/app/settings") {
        return new Response(JSON.stringify(appSettingsPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET" && url === "/api/v1/portfolios") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "POST" && url === "/api/v1/portfolios") {
        return new Response(
          JSON.stringify({
            id: "created",
            name: "Test",
            description: "",
            created_at: "2026-01-01T00:00:00Z",
            base_currency: "USD",
            initial_cash: 5000,
            open_positions: 0,
            total_positions: 0,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "GET" && url === "/api/v1/portfolios/created") {
        return new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "GET" && url === "/api/v1/portfolios/created/timeseries") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (method === "GET" && url === "/api/v1/portfolios/created/allocation") {
        return new Response(
          JSON.stringify([{ label: "Cash", ticker: "CASH", value: 5000, weight: 1 }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ detail: { code: "missing", message: `${method} ${url}` } }), {
        status: 404,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderApp();

    fireEvent.change(await screen.findByLabelText(/Name/i), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Portfolio/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/portfolios",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("opens the runtime settings modal", async () => {
    mockFetch({
      "GET /api/v1/app/bootstrap": {
        risk_free_rate: 4.25,
        benchmark_ticker: "SPY",
        capabilities: { agent: false, real_estate: false },
      },
      "GET /api/v1/app/settings": appSettingsPayload(),
      "GET /api/v1/portfolios": [],
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /Settings/i }));
    expect(await screen.findByRole("heading", { name: /Runtime Settings/i })).toBeInTheDocument();
  });
});
