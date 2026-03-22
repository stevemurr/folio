import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import {
  AppSettings,
  BookSnapshot,
  BookSummary,
  CollectionDetail,
  RunState,
  WorkspaceComparison,
  WorkspaceDetail,
  WorkspaceSummary,
  WorkspaceView,
} from "../api/client";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bootstrapPayload(agentEnabled = false) {
  return {
    risk_free_rate: 4.25,
    benchmark_ticker: "SPY",
    capabilities: { agent: agentEnabled, real_estate: false },
  };
}

function appSettingsPayload(agentEnabled = false): AppSettings {
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

function makeRunState(status: RunState["status"], openingSession = "2020-03-23", issues: RunState["issues"] = []): RunState {
  return {
    status,
    opening_session: openingSession,
    issues,
  };
}

function makeWorkspace(id: string, name: string, startDate: string, bookCount: number, collectionCount: number): WorkspaceSummary {
  return {
    id,
    name,
    start_date: startDate,
    created_at: "2026-03-20T00:00:00Z",
    book_count: bookCount,
    collection_count: collectionCount,
    run_state: makeRunState(bookCount > 0 ? "ready" : "draft", startDate),
  };
}

function makeBook(
  id: string,
  workspaceId: string,
  collectionId: string,
  collectionName: string,
  name: string,
  initialCash = 10000,
  runState?: RunState,
): BookSummary {
  return {
    id,
    workspace_id: workspaceId,
    collection_id: collectionId,
    collection_name: collectionName,
    name,
    description: `${name} description`,
    created_at: "2026-03-20T00:00:00Z",
    base_currency: "USD",
    initial_cash: initialCash,
    open_positions: 1,
    total_positions: 1,
    strategy_kind: "custom",
    preset_id: null,
    allocation_preview: [{ ticker: "VTI", asset_type: "etf", weight: 100 }],
    cash_weight: 0,
    run_state: runState ?? makeRunState("ready"),
  };
}

function makeCollection(
  id: string,
  workspaceId: string,
  name: string,
  initialCash: number,
  books: BookSummary[],
  runState?: RunState,
): CollectionDetail {
  return {
    id,
    workspace_id: workspaceId,
    name,
    created_at: "2026-03-20T00:00:00Z",
    initial_cash: initialCash,
    book_count: books.length,
    run_state: runState ?? makeRunState(books.length ? "ready" : "draft"),
    books,
  };
}

function makeWorkspaceView(workspace: WorkspaceSummary, collections: CollectionDetail[]): WorkspaceView {
  return {
    workspace: {
      ...workspace,
      book_count: collections.reduce((sum, collection) => sum + collection.books.length, 0),
      collection_count: collections.length,
      run_state: collections.some((collection) => collection.run_state.status === "ready")
        ? makeRunState("ready", workspace.start_date)
        : makeRunState("draft", workspace.start_date),
    } satisfies WorkspaceDetail,
    collections,
  };
}

function makeComparison(workspaceId: string, collections: CollectionDetail[], benchmarkTickers: string[], primary: string): WorkspaceComparison {
  const readyCollections = collections.filter((collection) => collection.run_state.status === "ready");
  const books = readyCollections.flatMap((collection) => collection.books);
  const bankrolls = [...new Set(readyCollections.map((collection) => collection.initial_cash))];
  const benchmarkSeries = bankrolls.flatMap((initialCash) =>
    benchmarkTickers.map((ticker) => ({
      key: `${initialCash}:${ticker}`,
      ticker,
      label: bankrolls.length > 1 ? `${ticker} · $${initialCash.toLocaleString("en-US")}` : ticker,
      collection_id: null,
      collection_name: null,
      is_primary: ticker === primary,
      initial_cash: initialCash,
    })),
  );
  const dates = ["2020-03-23", "2020-03-24", "2020-03-25"];

  return {
    workspace_id: workspaceId,
    primary_benchmark_ticker: primary,
    benchmark_tickers: benchmarkTickers,
    benchmark_series: benchmarkSeries,
    start_date: dates[0],
    end_date: dates[dates.length - 1],
    points: dates.map((currentDate, index) => ({
      date: currentDate,
      benchmark_values: Object.fromEntries(
        benchmarkSeries.map((series) => [series.key, series.initial_cash * (1 + index * 0.02)]),
      ),
      book_values: Object.fromEntries(
        books.map((book) => [book.id, book.initial_cash * (1 + index * 0.03)]),
      ),
    })),
  };
}

function makeSnapshot(book: BookSummary, asOf: string, benchmarkTicker: string): BookSnapshot {
  return {
    id: book.id,
    workspace_id: book.workspace_id,
    collection_id: book.collection_id,
    collection_name: book.collection_name,
    name: book.name,
    description: book.description,
    created_at: book.created_at,
    base_currency: book.base_currency,
    initial_cash: book.initial_cash,
    as_of: asOf,
    metrics: {
      book_id: book.id,
      total_value: book.initial_cash * 1.1,
      current_cash: 500,
      simple_roi: 0.1,
      annualized_return: 0.12,
      sharpe_ratio: 1.18,
      benchmark_sharpe_ratio: 1.04,
      relative_sharpe: 0.14,
      alpha: 0.03,
      beta: 0.92,
      benchmark_return: 0.07,
      benchmark_ticker: benchmarkTicker,
      risk_free_rate: 4.25,
      position_count: 1,
      open_position_count: 1,
    },
    positions: [
      {
        id: `${book.id}-position`,
        book_id: book.id,
        asset_type: "etf",
        ticker: "VTI",
        shares: 10,
        entry_price: 100,
        entry_date: "2020-03-23",
        exit_price: null,
        exit_date: null,
        notes: "",
        status: "open",
        current_price: 110,
        current_value: 1100,
        dollar_pnl: 100,
        simple_roi: 0.1,
        annualized_return: 0.12,
        sharpe_ratio: 1.18,
        weight: 0.9,
      },
    ],
    allocation: [
      { label: "VTI", ticker: "VTI", value: 1100, weight: 0.688 },
      { label: "Cash", ticker: "CASH", value: 500, weight: 0.312 },
    ],
  };
}

type MockState = {
  appSettings: AppSettings;
  bootstrap: ReturnType<typeof bootstrapPayload>;
  comparisonRequests: Array<{ workspaceId: string; payload: { benchmark_tickers: string[]; primary_benchmark_ticker?: string | null } }>;
  settingsPatches: Array<Record<string, unknown>>;
  snapshotRequests: string[];
  viewByWorkspaceId: Record<string, WorkspaceView>;
  workspaces: WorkspaceSummary[];
};

function renderApp(state: MockState) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? request?.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/api/v1/app/bootstrap") {
      return jsonResponse(state.bootstrap);
    }

    if (path === "/api/v1/app/settings") {
      if (method === "GET") {
        return jsonResponse(state.appSettings);
      }
      if (method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        state.settingsPatches.push(payload);
        if (payload.market && typeof payload.market === "object") {
          state.appSettings.market = { ...state.appSettings.market, ...(payload.market as Partial<AppSettings["market"]>) };
          state.bootstrap = {
            ...state.bootstrap,
            benchmark_ticker: state.appSettings.market.benchmark_ticker,
            risk_free_rate: state.appSettings.market.risk_free_rate,
          };
        }
        return jsonResponse(state.appSettings);
      }
    }

    if (method === "GET" && path === "/api/v1/workspaces") {
      return jsonResponse(state.workspaces);
    }

    const workspaceViewMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/view$/);
    if (method === "GET" && workspaceViewMatch) {
      return jsonResponse(state.viewByWorkspaceId[workspaceViewMatch[1]]);
    }

    const deleteWorkspaceMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)$/);
    if (method === "DELETE" && deleteWorkspaceMatch) {
      const workspaceId = deleteWorkspaceMatch[1];
      state.workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
      delete state.viewByWorkspaceId[workspaceId];
      return new Response(null, { status: 204 });
    }

    const createCollectionMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/collections$/);
    if (method === "POST" && createCollectionMatch) {
      const workspaceId = createCollectionMatch[1];
      const view = state.viewByWorkspaceId[workspaceId];
      const payload = JSON.parse(String(init?.body ?? "{}")) as { initial_cash: number; name?: string };
      const nextId = `collection-${view.collections.length + 1}`;
      const name = payload.name ?? `Collection ${view.collections.length + 1}`;
      const collection = makeCollection(nextId, workspaceId, name, payload.initial_cash, []);
      view.collections.push(collection);
      view.workspace.collection_count = view.collections.length;
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (workspace) {
        workspace.collection_count = view.collections.length;
      }
      return jsonResponse(collection, 201);
    }

    const updateCollectionMatch = path.match(/^\/api\/v1\/collections\/([^/]+)$/);
    if (method === "PATCH" && updateCollectionMatch) {
      const collectionId = updateCollectionMatch[1];
      const payload = JSON.parse(String(init?.body ?? "{}")) as { name?: string; initial_cash?: number };
      const view = Object.values(state.viewByWorkspaceId).find((item) => item.collections.some((collection) => collection.id === collectionId));
      const collection = view?.collections.find((item) => item.id === collectionId);
      if (!view || !collection) {
        return jsonResponse({ detail: { code: "not_found", message: "Missing collection" } }, 404);
      }
      if (payload.name) {
        collection.name = payload.name;
        collection.books.forEach((book) => {
          book.collection_name = payload.name;
        });
      }
      if (payload.initial_cash) {
        collection.initial_cash = payload.initial_cash;
        collection.books.forEach((book) => {
          book.initial_cash = payload.initial_cash as number;
        });
      }
      return jsonResponse(collection);
    }

    const comparisonMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/comparison$/);
    if (method === "POST" && comparisonMatch) {
      const workspaceId = comparisonMatch[1];
      const payload = JSON.parse(String(init?.body ?? "{}")) as { benchmark_tickers: string[]; primary_benchmark_ticker?: string | null };
      state.comparisonRequests.push({ workspaceId, payload });
      return jsonResponse(
        makeComparison(
          workspaceId,
          state.viewByWorkspaceId[workspaceId].collections,
          payload.benchmark_tickers,
          payload.primary_benchmark_ticker ?? payload.benchmark_tickers[0] ?? "SPY",
        ),
      );
    }

    const snapshotMatch = path.match(/^\/api\/v1\/books\/([^/]+)\/snapshot$/);
    if (method === "GET" && snapshotMatch) {
      state.snapshotRequests.push(url.toString());
      const bookId = snapshotMatch[1];
      const asOf = url.searchParams.get("as_of") ?? "2020-03-23";
      const benchmarkTicker = url.searchParams.get("benchmark_ticker") ?? "SPY";
      const book =
        Object.values(state.viewByWorkspaceId)
          .flatMap((view) => view.collections)
          .flatMap((collection) => collection.books)
          .find((item) => item.id === bookId) ?? null;
      if (!book) {
        return jsonResponse({ detail: { code: "not_found", message: "Missing book" } }, 404);
      }
      return jsonResponse(makeSnapshot(book, asOf, benchmarkTicker));
    }

    return jsonResponse({ detail: { code: "unhandled", message: `${method} ${path}` } }, 500);
  });

  vi.stubGlobal("fetch", fetchMock);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );

  return { fetchMock };
}

async function openWorkspace(name: string) {
  let workspaceButton: HTMLElement | null = null;
  try {
    workspaceButton = await screen.findByRole("button", { name: new RegExp(name, "i") });
  } catch {
    const browserButton = await screen.findByRole("button", { name: /workspace browser/i });
    fireEvent.click(browserButton);
    workspaceButton = await screen.findByRole("button", { name: new RegExp(name, "i") });
  }
  fireEvent.click(workspaceButton);
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders collection groups, adds a collection, and edits collection bankroll", async () => {
    const workspace = makeWorkspace("ws-1", "March 23, 2020", "2020-03-23", 2, 2);
    const core = makeBook("book-1", workspace.id, "collection-1", "Collection 1", "Core");
    const challenger = makeBook("book-2", workspace.id, "collection-2", "Collection 2", "Challenger");
    const view = makeWorkspaceView(workspace, [
      makeCollection("collection-1", workspace.id, "Collection 1", 10000, [core]),
      makeCollection("collection-2", workspace.id, "Collection 2", 10000, [challenger]),
    ]);

    renderApp({
      appSettings: appSettingsPayload(),
      bootstrap: bootstrapPayload(),
      comparisonRequests: [],
      settingsPatches: [],
      snapshotRequests: [],
      viewByWorkspaceId: { [workspace.id]: view },
      workspaces: [workspace],
    });

    await openWorkspace("March 23, 2020");

    expect(await screen.findByText("Collection 1")).toBeInTheDocument();
    expect(screen.getByText("Collection 2")).toBeInTheDocument();

    const promptMock = vi.spyOn(window, "prompt");
    promptMock.mockReturnValueOnce("25000");
    fireEvent.click(screen.getAllByRole("button", { name: /bankroll/i })[0]);

    await screen.findByText("$25,000");

    fireEvent.click(screen.getByRole("button", { name: /add collection/i }));

    expect(await screen.findByText("Collection 3")).toBeInTheDocument();
  });

  it("opens on the browser when saved workspaces exist and can jump into create flow", async () => {
    const workspace = makeWorkspace("ws-1", "March 23, 2020", "2020-03-23", 0, 1);
    const view = makeWorkspaceView(workspace, [makeCollection("collection-1", workspace.id, "Collection 1", 10000, [])]);

    renderApp({
      appSettings: appSettingsPayload(),
      bootstrap: bootstrapPayload(),
      comparisonRequests: [],
      settingsPatches: [],
      snapshotRequests: [],
      viewByWorkspaceId: { [workspace.id]: view },
      workspaces: [workspace],
    });

    expect(await screen.findByText("Open Workspace")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByRole("heading", { name: "Create Workspace" })).toBeInTheDocument();
  });

  it("deletes a workspace from the browser row action", async () => {
    const workspaceA = makeWorkspace("ws-1", "March 23, 2020", "2020-03-23", 0, 1);
    const workspaceB = makeWorkspace("ws-2", "March 09, 2009", "2009-03-09", 0, 1);
    const viewA = makeWorkspaceView(workspaceA, [makeCollection("collection-1", workspaceA.id, "Collection 1", 10000, [])]);
    const viewB = makeWorkspaceView(workspaceB, [makeCollection("collection-2", workspaceB.id, "Collection 1", 10000, [])]);

    renderApp({
      appSettings: appSettingsPayload(),
      bootstrap: bootstrapPayload(),
      comparisonRequests: [],
      settingsPatches: [],
      snapshotRequests: [],
      viewByWorkspaceId: { [workspaceA.id]: viewA, [workspaceB.id]: viewB },
      workspaces: [workspaceA, workspaceB],
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    expect(await screen.findByText("March 23, 2020")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /delete workspace/i })[0]);

    await waitFor(() => expect(screen.queryByText("March 23, 2020")).not.toBeInTheDocument());
    expect(screen.getByText("March 09, 2009")).toBeInTheDocument();
  });

  it("enters run mode from the top bar and refetches comparison and snapshots with overlay choices", async () => {
    const workspace = makeWorkspace("ws-1", "March 23, 2020", "2020-03-23", 2, 2);
    const core = makeBook("book-1", workspace.id, "collection-1", "Collection 1", "Core");
    const challenger = makeBook("book-2", workspace.id, "collection-2", "Collection 2", "Challenger");
    const view = makeWorkspaceView(workspace, [
      makeCollection("collection-1", workspace.id, "Collection 1", 10000, [core]),
      makeCollection("collection-2", workspace.id, "Collection 2", 10000, [challenger]),
    ]);
    const state: MockState = {
      appSettings: appSettingsPayload(),
      bootstrap: bootstrapPayload(),
      comparisonRequests: [],
      settingsPatches: [],
      snapshotRequests: [],
      viewByWorkspaceId: { [workspace.id]: view },
      workspaces: [workspace],
    };

    renderApp(state);
    await openWorkspace("March 23, 2020");

    fireEvent.click(await screen.findByRole("button", { name: /^run$/i }));

    await screen.findByText("Shared replay");
    await waitFor(() => expect(state.comparisonRequests.length).toBeGreaterThan(0));
    expect(state.comparisonRequests[state.comparisonRequests.length - 1]?.payload.benchmark_tickers).toEqual(["SPY"]);

    fireEvent.click(await screen.findByRole("button", { name: "QQQ" }));
    await waitFor(() =>
      expect(state.comparisonRequests[state.comparisonRequests.length - 1]?.payload.benchmark_tickers).toEqual(
        expect.arrayContaining(["SPY", "QQQ"]),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "QQQ" }));
    await waitFor(() =>
      expect(state.snapshotRequests.some((url) => new URL(url).searchParams.get("benchmark_ticker") === "QQQ")).toBe(true),
    );

    expect(screen.getByRole("button", { name: /back to setup/i })).toBeInTheDocument();
  });

  it("opens and saves the runtime settings modal", async () => {
    const workspace = makeWorkspace("ws-1", "March 23, 2020", "2020-03-23", 0, 1);
    const view = makeWorkspaceView(workspace, [makeCollection("collection-1", workspace.id, "Collection 1", 10000, [])]);
    const state: MockState = {
      appSettings: appSettingsPayload(),
      bootstrap: bootstrapPayload(),
      comparisonRequests: [],
      settingsPatches: [],
      snapshotRequests: [],
      viewByWorkspaceId: { [workspace.id]: view },
      workspaces: [workspace],
    };

    renderApp(state);

    const settingsButton = await screen.findByRole("button", { name: /settings/i });
    await waitFor(() => expect(settingsButton).not.toBeDisabled());
    fireEvent.click(settingsButton);

    expect(await screen.findByText(/Tune the runtime defaults/i)).toBeInTheDocument();

    const benchmarkInput = screen.getByDisplayValue("SPY");
    fireEvent.change(benchmarkInput, { target: { value: "QQQ" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(state.settingsPatches).toHaveLength(1));
    expect(state.settingsPatches[0]).toMatchObject({
      market: expect.objectContaining({ benchmark_ticker: "QQQ" }),
    });
  });
});
