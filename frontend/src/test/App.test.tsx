import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "../App";
import {
  BookConfig,
  BookCreateRequest,
  BookSnapshot,
  BookSummary,
  MarketSearchResult,
  WorkspaceComparison,
  WorkspaceBenchmark,
  WorkspaceSummary,
  WorkspaceView,
} from "../api/client";

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

function makeWorkspace(id: string, name: string, startDate: string, bookCount: number): WorkspaceSummary {
  return {
    id,
    name,
    start_date: startDate,
    created_at: "2026-03-20T00:00:00Z",
    book_count: bookCount,
  };
}

function makeBook(id: string, workspaceId: string, name: string, description: string): BookSummary {
  return {
    id,
    workspace_id: workspaceId,
    name,
    description,
    created_at: "2026-03-20T00:00:00Z",
    base_currency: "USD",
    initial_cash: 10000,
    open_positions: 1,
    total_positions: 1,
    strategy_kind: "custom",
    preset_id: null,
    allocation_preview: [],
    cash_weight: 0,
  };
}

function defaultBenchmarks(primary = "SPY"): WorkspaceBenchmark[] {
  return [{ ticker: primary, is_primary: true }];
}

function makeComparison(
  workspaceId: string,
  startDate: string,
  rows: Array<{
    date: string;
    benchmark: number;
    values: Record<string, number>;
  }>,
): WorkspaceComparison {
  return {
    workspace_id: workspaceId,
    primary_benchmark_ticker: "SPY",
    benchmark_tickers: ["SPY"],
    start_date: startDate,
    end_date: rows[rows.length - 1]?.date ?? startDate,
    points: rows.map((row) => ({
      date: row.date,
      benchmark_values: { SPY: row.benchmark },
      book_values: row.values,
    })),
  };
}

function makeWorkspaceView(
  workspace: WorkspaceSummary,
  books: BookSummary[],
  comparison: WorkspaceComparison,
  meta?: { initial_cash?: number; benchmarks?: WorkspaceBenchmark[] },
): WorkspaceView {
  return {
    workspace: {
      ...workspace,
      book_count: books.length,
      initial_cash: meta?.initial_cash ?? 10000,
      benchmarks: meta?.benchmarks ?? defaultBenchmarks(),
    },
    books,
    comparison,
  };
}

function makeSnapshot(
  book: BookSummary,
  asOf: string,
  ticker: string,
  totalValue: number,
  currentCash = 500,
): BookSnapshot {
  const investedValue = totalValue - currentCash;
  return {
    id: book.id,
    workspace_id: book.workspace_id,
    name: book.name,
    description: book.description,
    created_at: book.created_at,
    base_currency: book.base_currency,
    initial_cash: book.initial_cash,
    as_of: asOf,
    metrics: {
      book_id: book.id,
      total_value: totalValue,
      current_cash: currentCash,
      simple_roi: totalValue / 10000 - 1,
      annualized_return: 0.12,
      sharpe_ratio: 1.18,
      benchmark_sharpe_ratio: 1.04,
      relative_sharpe: 0.14,
      alpha: 0.03,
      beta: 0.92,
      benchmark_return: 0.07,
      benchmark_ticker: "SPY",
      risk_free_rate: 4.25,
      position_count: 1,
      open_position_count: 1,
    },
    positions: [
      {
        id: `${book.id}-${ticker}-${asOf}`,
        book_id: book.id,
        asset_type: ticker === "AAPL" ? "stock" : "etf",
        ticker,
        shares: 10,
        entry_price: 100,
        entry_date: "1998-02-18",
        exit_price: null,
        exit_date: null,
        notes: "",
        status: "open",
        current_price: investedValue / 10,
        current_value: investedValue,
        dollar_pnl: investedValue - 1000,
        simple_roi: investedValue / 1000 - 1,
        annualized_return: 0.12,
        sharpe_ratio: 1.18,
        weight: investedValue / totalValue,
      },
    ],
    allocation: [
      { label: ticker, ticker, value: investedValue, weight: investedValue / totalValue },
      { label: "Cash", ticker: "CASH", value: currentCash, weight: currentCash / totalValue },
    ],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type MockState = {
  booksByWorkspace: Record<string, BookSummary[]>;
  bookConfigsById: Record<string, BookConfig>;
  createdBookPayloads: Array<{ payload: BookCreateRequest; workspaceId: string }>;
  createdWorkspacePayloads: Array<{ start_date: string }>;
  workspaces: WorkspaceSummary[];
  workspaceMetaById: Record<string, { initial_cash: number; benchmarks: WorkspaceBenchmark[] }>;
};

type MockScenario = {
  bookConfigsById?: Record<string, BookConfig>;
  booksByWorkspace?: Record<string, BookSummary[]>;
  comparisonsByWorkspace?: Record<string, WorkspaceComparison>;
  createBook?: (workspaceId: string, payload: BookCreateRequest, state: MockState) => BookSummary;
  createWorkspace?: (payload: { start_date: string }, state: MockState) => WorkspaceSummary;
  resolveComparison?: (workspaceId: string, state: MockState) => WorkspaceComparison;
  resolveSnapshot?: (bookId: string, asOf: string, state: MockState) => BookSnapshot;
  searchResults?: Record<string, MarketSearchResult[]>;
  snapshotsByBook?: Record<string, Record<string, BookSnapshot>>;
  workspaces?: WorkspaceSummary[];
  workspaceMetaById?: Record<string, { initial_cash: number; benchmarks: WorkspaceBenchmark[] }>;
};

function cloneRecord<T extends Record<string, unknown>>(value: Record<string, T[]> | undefined): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([key, entries]) => [key, entries.map((entry) => ({ ...entry }))]),
  );
}

function cloneWorkspaceMetaRecord(
  value: Record<string, { initial_cash: number; benchmarks: WorkspaceBenchmark[] }> | undefined,
): Record<string, { initial_cash: number; benchmarks: WorkspaceBenchmark[] }> {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([key, meta]) => [
      key,
      {
        initial_cash: meta.initial_cash,
        benchmarks: meta.benchmarks.map((benchmark) => ({ ...benchmark })),
      },
    ]),
  );
}

function cloneBookConfigs(value: Record<string, BookConfig> | undefined): Record<string, BookConfig> {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([key, config]) => [
      key,
      {
        ...config,
        allocations: config.allocations.map((allocation) => ({ ...allocation })),
      },
    ]),
  );
}

function defaultBookConfig(book: BookSummary): BookConfig {
  return {
    id: book.id,
    workspace_id: book.workspace_id,
    name: book.name,
    description: book.description,
    strategy_kind: book.strategy_kind,
    preset_id: book.preset_id ?? null,
    allocations:
      book.allocation_preview.length > 0
        ? book.allocation_preview.map((allocation) => ({
            ticker: allocation.ticker,
            asset_type: allocation.asset_type,
            weight: allocation.weight,
          }))
        : [{ ticker: "VTI", asset_type: "etf", weight: 100 }],
  };
}

function installFetchMock(scenario: MockScenario) {
  const state: MockState = {
    workspaces: (scenario.workspaces ?? []).map((workspace) => ({ ...workspace })),
    booksByWorkspace: cloneRecord(scenario.booksByWorkspace),
    bookConfigsById: cloneBookConfigs(scenario.bookConfigsById),
    createdWorkspacePayloads: [],
    createdBookPayloads: [],
    workspaceMetaById: cloneWorkspaceMetaRecord(scenario.workspaceMetaById),
  };

  for (const workspace of state.workspaces) {
    state.workspaceMetaById[workspace.id] ??= {
      initial_cash: 10000,
      benchmarks: defaultBenchmarks(),
    };
  }

  for (const books of Object.values(state.booksByWorkspace)) {
    for (const book of books) {
      state.bookConfigsById[book.id] ??= defaultBookConfig(book);
    }
  }

  function emptyComparison(workspaceId: string): WorkspaceComparison {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    const startDate = workspace?.start_date ?? "1998-02-18";
    return {
      workspace_id: workspaceId,
      primary_benchmark_ticker: "SPY",
      benchmark_tickers: ["SPY"],
      start_date: startDate,
      end_date: startDate,
      points: [],
    };
  }

  function workspaceViewPayload(workspaceId: string): WorkspaceView {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error(`Missing workspace ${workspaceId}`);
    }
    const books = state.booksByWorkspace[workspaceId] ?? [];
    const comparison =
      scenario.resolveComparison?.(workspaceId, state) ??
      scenario.comparisonsByWorkspace?.[workspaceId] ??
      emptyComparison(workspaceId);
    return makeWorkspaceView(workspace, books, comparison, state.workspaceMetaById[workspaceId]);
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const path = url.pathname;

    if (method === "GET" && path === "/api/v1/app/bootstrap") {
      return jsonResponse(bootstrapPayload());
    }
    if (method === "GET" && path === "/api/v1/app/settings") {
      return jsonResponse(appSettingsPayload());
    }
    if (method === "GET" && path === "/api/v1/workspaces") {
      return jsonResponse(state.workspaces);
    }
    if (method === "POST" && path === "/api/v1/workspaces") {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { start_date: string };
      state.createdWorkspacePayloads.push(payload);
      const created =
        scenario.createWorkspace?.(payload, state) ??
        makeWorkspace(`ws-${state.workspaces.length + 1}`, `Workspace ${state.workspaces.length + 1}`, payload.start_date, 0);
      state.workspaces.push(created);
      state.workspaceMetaById[created.id] = {
        initial_cash: 10000,
        benchmarks: defaultBenchmarks(),
      };
      return jsonResponse(workspaceViewPayload(created.id), 201);
    }

    const workspaceComparisonMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/comparison$/);
    if (method === "GET" && workspaceComparisonMatch) {
      const workspaceId = workspaceComparisonMatch[1];
      const payload =
        scenario.resolveComparison?.(workspaceId, state) ??
        scenario.comparisonsByWorkspace?.[workspaceId] ??
        emptyComparison(workspaceId);
      return jsonResponse(payload);
    }

    const workspaceBooksMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/books$/);
    if (method === "GET" && workspaceBooksMatch) {
      return jsonResponse(state.booksByWorkspace[workspaceBooksMatch[1]] ?? []);
    }
    if (method === "POST" && workspaceBooksMatch) {
      const workspaceId = workspaceBooksMatch[1];
      const payload = JSON.parse(String(init?.body ?? "{}")) as BookCreateRequest;
      state.createdBookPayloads.push({ payload, workspaceId });
      const created =
        scenario.createBook?.(workspaceId, payload, state) ??
        {
          ...makeBook(`book-${state.createdBookPayloads.length}`, workspaceId, payload.name, payload.description),
          strategy_kind: payload.strategy_kind,
          preset_id: payload.preset_id ?? null,
          allocation_preview: payload.allocations.map((allocation) => ({
            ticker: allocation.ticker,
            asset_type: allocation.asset_type,
            weight: allocation.weight,
          })),
          cash_weight: Math.max(
            0,
            100 - payload.allocations.reduce((sum, allocation) => sum + allocation.weight, 0),
          ),
        };
      state.booksByWorkspace[workspaceId] = [...(state.booksByWorkspace[workspaceId] ?? []), created];
      state.bookConfigsById[created.id] = {
        id: created.id,
        workspace_id: workspaceId,
        name: payload.name,
        description: payload.description,
        strategy_kind: payload.strategy_kind,
        preset_id: payload.preset_id ?? null,
        allocations: payload.allocations,
      };
      state.workspaces = state.workspaces.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, book_count: (state.booksByWorkspace[workspaceId] ?? []).length } : workspace,
      );
      const snapshotAsOf =
        payload.snapshot_as_of ??
        workspaceViewPayload(workspaceId).comparison.points[0]?.date ??
        state.workspaces.find((workspace) => workspace.id === workspaceId)?.start_date ??
        "1998-02-18";
      const snapshot =
        scenario.resolveSnapshot?.(created.id, snapshotAsOf, state) ??
        scenario.snapshotsByBook?.[created.id]?.[snapshotAsOf] ??
        makeSnapshot(created, snapshotAsOf, payload.allocations[0]?.ticker ?? "VTI", 10000);
      return jsonResponse(
        {
          book: created,
          workspace_view: workspaceViewPayload(workspaceId),
          snapshot,
        },
        201,
      );
    }

    const workspaceViewMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/view$/);
    if (method === "GET" && workspaceViewMatch) {
      const workspaceId = workspaceViewMatch[1];
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return workspace ? jsonResponse(workspaceViewPayload(workspaceId)) : jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
    }

    const workspaceDetailMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)$/);
    if (method === "PATCH" && workspaceDetailMatch) {
      const workspaceId = workspaceDetailMatch[1];
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) {
        return jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        initial_cash?: number;
        benchmark_tickers?: string[];
        primary_benchmark_ticker?: string;
      };
      const currentMeta = state.workspaceMetaById[workspaceId] ?? { initial_cash: 10000, benchmarks: defaultBenchmarks() };
      const benchmarkTickers =
        payload.benchmark_tickers ??
        currentMeta.benchmarks.map((benchmark) => benchmark.ticker);
      const primary =
        payload.primary_benchmark_ticker ??
        currentMeta.benchmarks.find((benchmark) => benchmark.is_primary)?.ticker ??
        benchmarkTickers[0] ??
        "SPY";

      state.workspaceMetaById[workspaceId] = {
        initial_cash: payload.initial_cash ?? currentMeta.initial_cash,
        benchmarks: benchmarkTickers.map((ticker) => ({ ticker, is_primary: ticker === primary })),
      };

      return jsonResponse(workspaceViewPayload(workspaceId));
    }
    if (method === "GET" && workspaceDetailMatch) {
      const workspace = state.workspaces.find((item) => item.id === workspaceDetailMatch[1]);
      return workspace
        ? jsonResponse(makeWorkspaceView(workspace, state.booksByWorkspace[workspace.id] ?? [], emptyComparison(workspace.id), state.workspaceMetaById[workspace.id]).workspace)
        : jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
    }

    const bookConfigMatch = path.match(/^\/api\/v1\/books\/([^/]+)\/config$/);
    if (method === "GET" && bookConfigMatch) {
      const payload = state.bookConfigsById[bookConfigMatch[1]];
      return payload ? jsonResponse(payload) : jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
    }

    const bookUpdateMatch = path.match(/^\/api\/v1\/books\/([^/]+)$/);
    if (method === "PATCH" && bookUpdateMatch) {
      const bookId = bookUpdateMatch[1];
      const payload = JSON.parse(String(init?.body ?? "{}")) as BookCreateRequest;
      const currentConfig = state.bookConfigsById[bookId];
      if (!currentConfig) {
        return jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
      }

      state.bookConfigsById[bookId] = {
        ...currentConfig,
        name: payload.name,
        description: payload.description,
        strategy_kind: payload.strategy_kind,
        preset_id: payload.preset_id ?? null,
        allocations: payload.allocations,
      };

      let updatedBook: BookSummary | null = null;
      state.booksByWorkspace[currentConfig.workspace_id] = (state.booksByWorkspace[currentConfig.workspace_id] ?? []).map((book) => {
        if (book.id !== bookId) {
          return book;
        }
        updatedBook = {
          ...book,
          name: payload.name,
          description: payload.description,
          strategy_kind: payload.strategy_kind,
          preset_id: payload.preset_id ?? null,
          allocation_preview: payload.allocations.map((allocation) => ({
            ticker: allocation.ticker,
            asset_type: allocation.asset_type,
            weight: allocation.weight,
          })),
          cash_weight: Math.max(
            0,
            100 - payload.allocations.reduce((sum, allocation) => sum + allocation.weight, 0),
          ),
        };
        return updatedBook;
      });

      const workspaceId = currentConfig.workspace_id;
      const summary = updatedBook ?? (state.booksByWorkspace[workspaceId] ?? []).find((book) => book.id === bookId);
      if (!summary) {
        return jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
      }
      const snapshotAsOf =
        state.workspaces.find((workspace) => workspace.id === workspaceId)?.start_date ?? "1998-02-18";
      const snapshot =
        scenario.resolveSnapshot?.(bookId, snapshotAsOf, state) ??
        scenario.snapshotsByBook?.[bookId]?.[snapshotAsOf] ??
        makeSnapshot(summary, snapshotAsOf, payload.allocations[0]?.ticker ?? "VTI", state.workspaceMetaById[workspaceId]?.initial_cash ?? 10000);
      return jsonResponse({
        book: summary,
        workspace_view: workspaceViewPayload(workspaceId),
        snapshot,
      });
    }

    const bookSnapshotMatch = path.match(/^\/api\/v1\/books\/([^/]+)\/snapshot$/);
    if (method === "GET" && bookSnapshotMatch) {
      const bookId = bookSnapshotMatch[1];
      const asOf = url.searchParams.get("as_of") ?? "";
      const payload = scenario.resolveSnapshot?.(bookId, asOf, state) ?? scenario.snapshotsByBook?.[bookId]?.[asOf];
      return payload ? jsonResponse(payload) : jsonResponse({ detail: { code: "missing", message: "Missing" } }, 404);
    }

    if (method === "GET" && path === "/api/v1/market/search") {
      const query = url.searchParams.get("q") ?? "";
      return jsonResponse(scenario.searchResults?.[query] ?? []);
    }

    if (method === "DELETE" && path.startsWith("/api/v1/books/")) {
      const bookId = path.split("/").pop() ?? "";
      for (const [workspaceId, books] of Object.entries(state.booksByWorkspace)) {
        state.booksByWorkspace[workspaceId] = books.filter((book) => book.id !== bookId);
        state.workspaces = state.workspaces.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, book_count: state.booksByWorkspace[workspaceId].length } : workspace,
        );
      }
      delete state.bookConfigsById[bookId];
      return jsonResponse(undefined, 204);
    }

    if (method === "DELETE" && path.startsWith("/api/v1/workspaces/")) {
      return jsonResponse(undefined, 204);
    }

    return jsonResponse({ detail: { code: "missing", message: `${method} ${path}` } }, 404);
  }) as typeof fetch;

  globalThis.fetch = fetchMock;
  return { fetchMock, state };
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

function matchingCalls(fetchMock: typeof fetch, matcher: (url: URL, method: string) => boolean) {
  return (fetchMock as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit | undefined]> } }).mock.calls.filter(
    ([input, init]) => {
      const method = init?.method ?? "GET";
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      return matcher(url, method);
    },
  );
}

async function clickWorkspaceCard(name: string) {
  const label = await screen.findByText(name);
  const button = label.closest("button");
  if (!button) {
    throw new Error(`Workspace button for "${name}" was not found.`);
  }
  fireEvent.click(button);
}

describe("App", () => {
  it("renders the focused workspace creator when no workspaces exist", async () => {
    installFetchMock({ workspaces: [] });

    renderApp();

    expect(await screen.findByRole("heading", { name: /Create Workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Open Workspace/i })).not.toBeInTheDocument();
  });

  it("creates a workspace and lands in the books phase", async () => {
    const createdWorkspace = makeWorkspace("ws-created", "March 2000", "2000-03-01", 0);
    const { state } = installFetchMock({
      workspaces: [],
      createWorkspace: () => createdWorkspace,
    });

    renderApp();

    await screen.findByRole("heading", { name: /Create Workspace/i });
    fireEvent.change(screen.getByLabelText(/Workspace Start Date/i), { target: { value: "2000-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Workspace/i }));

    expect(await screen.findByRole("heading", { name: "March 2000" })).toBeInTheDocument();
    expect(screen.getByText(/Build the books for this age\./i)).toBeInTheDocument();
    expect(state.createdWorkspacePayloads[0]).toEqual({ start_date: "2000-03-01" });
  });

  it("renders a multi-book workspace and switches between saved workspaces", async () => {
    const ws1 = makeWorkspace("ws-1", "Tech Bubble", "1998-02-18", 2);
    const ws2 = makeWorkspace("ws-2", "Recovery Desk", "2009-03-09", 1);
    const core = makeBook("book-core", ws1.id, "Core", "Preset spread");
    const growth = makeBook("book-growth", ws1.id, "Growth Tilt", "More QQQ");
    const recovery = makeBook("book-recovery", ws2.id, "Recovery", "Second workspace");

    const { fetchMock } = installFetchMock({
      workspaces: [ws1, ws2],
      booksByWorkspace: {
        [ws1.id]: [core, growth],
        [ws2.id]: [recovery],
      },
      comparisonsByWorkspace: {
        [ws1.id]: makeComparison(ws1.id, ws1.start_date, [
          { date: "1998-02-18", benchmark: 10000, values: { [core.id]: 10000, [growth.id]: 10000 } },
          { date: "1998-02-19", benchmark: 10125, values: { [core.id]: 10200, [growth.id]: 10350 } },
        ]),
        [ws2.id]: makeComparison(ws2.id, ws2.start_date, [
          { date: "2009-03-09", benchmark: 10000, values: { [recovery.id]: 10000 } },
          { date: "2009-03-10", benchmark: 10320, values: { [recovery.id]: 10440 } },
        ]),
      },
      snapshotsByBook: {
        [core.id]: {
          "1998-02-18": makeSnapshot(core, "1998-02-18", "VTI", 10000),
          "1998-02-19": makeSnapshot(core, "1998-02-19", "VTI", 10200),
        },
        [growth.id]: {
          "1998-02-18": makeSnapshot(growth, "1998-02-18", "QQQ", 10000),
          "1998-02-19": makeSnapshot(growth, "1998-02-19", "QQQ", 10350),
        },
        [recovery.id]: {
          "2009-03-09": makeSnapshot(recovery, "2009-03-09", "VTI", 10000),
          "2009-03-10": makeSnapshot(recovery, "2009-03-10", "VTI", 10440),
        },
      },
    });

    renderApp();

    await screen.findByRole("heading", { name: /Create Workspace/i });
    fireEvent.click(await screen.findByRole("button", { name: /Workspace Browser/i }));
    await clickWorkspaceCard("Tech Bubble");

    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/workspaces/${ws1.id}/view`)).toHaveLength(1);
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/workspaces/${ws1.id}/books`)).toHaveLength(0);
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/workspaces/${ws1.id}/comparison`)).toHaveLength(0);

    expect(await screen.findByRole("heading", { name: "Tech Bubble" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Core/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Growth Tilt/i })).toBeInTheDocument();
    expect(screen.getAllByText("SPY").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Workspace Browser/i }));
    fireEvent.click(screen.getByRole("button", { name: /Recovery Desk/i }));

    expect(await screen.findByText(/Build the books for this age\./i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Recovery Desk" }).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Growth Tilt/i })).not.toBeInTheDocument();
    });
  });

  it("creates a custom basket book from market search", async () => {
    const workspace = makeWorkspace("ws-1", "Custom Test", "1998-02-18", 0);
    const createdBook = makeBook("book-aapl", workspace.id, "Tech Tilt", "Custom basket");
    const { state, fetchMock } = installFetchMock({
      workspaces: [workspace],
      booksByWorkspace: { [workspace.id]: [] },
      searchResults: {
        AAPL: [
          {
            ticker: "AAPL",
            name: "Apple Inc.",
            asset_type: "stock",
            exchange: "NASDAQ",
          },
        ],
      },
      createBook: () => createdBook,
      resolveComparison: (workspaceId, mockState) => {
        const books = mockState.booksByWorkspace[workspaceId] ?? [];
        if (!books.length) {
          return makeComparison(workspaceId, workspace.start_date, []);
        }
        return makeComparison(workspaceId, workspace.start_date, [
          { date: "1998-02-18", benchmark: 10000, values: { [createdBook.id]: 10000 } },
          { date: "1998-02-19", benchmark: 10110, values: { [createdBook.id]: 10240 } },
        ]);
      },
      resolveSnapshot: (bookId, asOf) => makeSnapshot(createdBook, asOf, "AAPL", asOf === "1998-02-18" ? 10000 : 10240),
    });

    renderApp();

    await screen.findByRole("heading", { name: /Create Workspace/i });
    fireEvent.click(await screen.findByRole("button", { name: /Workspace Browser/i }));
    await clickWorkspaceCard("Custom Test");

    expect(await screen.findByRole("heading", { name: "Custom Test" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add Book/i }));

    fireEvent.click(screen.getByRole("button", { name: /Custom Basket/i }));
    fireEvent.change(screen.getByLabelText(/Search stock or ETF/i), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/Search stock or ETF/i), { target: { value: "AA" } });
    fireEvent.change(screen.getByLabelText(/Search stock or ETF/i), { target: { value: "AAP" } });
    fireEvent.change(screen.getByLabelText(/Search stock or ETF/i), { target: { value: "AAPL" } });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });

    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === "/api/v1/market/search")).toHaveLength(1);
    fireEvent.click(await screen.findByRole("button", { name: /AAPL/i }));
    fireEvent.change(screen.getByLabelText(/Book Name/i), { target: { value: "Tech Tilt" } });
    fireEvent.change(screen.getByLabelText(/AAPL weight/i), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Book/i }));

    expect(await screen.findByRole("button", { name: /Select Tech Tilt/i })).toBeInTheDocument();
    expect(matchingCalls(fetchMock, (url, method) => method === "POST" && url.pathname === `/api/v1/workspaces/${workspace.id}/books`)).toHaveLength(1);
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/workspaces/${workspace.id}/view`)).toHaveLength(1);
    expect(state.createdBookPayloads[0]).toEqual({
      workspaceId: workspace.id,
      payload: {
        name: "Tech Tilt",
        description: "Broad market first, growth second, with ballast.",
        strategy_kind: "custom",
        preset_id: null,
        allocations: [{ ticker: "AAPL", asset_type: "stock", weight: 55 }],
        snapshot_as_of: "1998-02-18",
      },
    });
  });

  it("keeps the run paused until play and fetches snapshots only during the run phase", async () => {
    const workspace = makeWorkspace("ws-1", "Replay Desk", "1998-02-18", 1);
    const book = makeBook("book-core", workspace.id, "Core", "Preset spread");

    const { fetchMock } = installFetchMock({
      workspaces: [workspace],
      booksByWorkspace: { [workspace.id]: [book] },
      comparisonsByWorkspace: {
        [workspace.id]: makeComparison(workspace.id, workspace.start_date, [
          { date: "1998-02-18", benchmark: 10000, values: { [book.id]: 10000 } },
          { date: "1998-02-19", benchmark: 10080, values: { [book.id]: 10220 } },
          { date: "1998-02-20", benchmark: 10140, values: { [book.id]: 10410 } },
        ]),
      },
      resolveSnapshot: (bookId, asOf) => {
        const values: Record<string, number> = {
          "1998-02-18": 10000,
          "1998-02-19": 10220,
          "1998-02-20": 10410,
        };
        return makeSnapshot(book, asOf, "VTI", values[asOf]);
      },
    });

    renderApp();

    await screen.findByRole("heading", { name: /Create Workspace/i });
    fireEvent.click(await screen.findByRole("button", { name: /Workspace Browser/i }));
    await clickWorkspaceCard("Replay Desk");

    expect(await screen.findByRole("heading", { name: "Replay Desk" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Play$/i })).not.toBeInTheDocument();
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/books/${book.id}/snapshot`)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Run Simulation/i }));
    expect(await screen.findByRole("button", { name: /^Play$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("February 18, 1998").length).toBeGreaterThan(0);
    });
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/books/${book.id}/snapshot`)).toHaveLength(1);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 240));
    });

    expect(screen.queryByText("February 19, 1998")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 240));
    });

    await waitFor(() => {
      expect(screen.getAllByText("February 19, 1998").length).toBeGreaterThan(0);
    });
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/books/${book.id}/snapshot`)).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/Comparison timeline/i), { target: { value: "2" } });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    });

    expect(await screen.findByRole("button", { name: /^Play$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("February 20, 1998").length).toBeGreaterThan(0);
    });
    expect(matchingCalls(fetchMock, (url, method) => method === "GET" && url.pathname === `/api/v1/books/${book.id}/snapshot`)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    await waitFor(() => {
      expect(screen.getAllByText("February 18, 1998").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /Books/i }));
    expect(await screen.findByText(/Build the books for this age\./i)).toBeInTheDocument();
  });
});
