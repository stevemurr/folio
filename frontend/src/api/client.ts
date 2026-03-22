export type ApiError = {
  code: string;
  message: string;
};

export type RunStateIssue = {
  code: string;
  message: string;
  ticker?: string | null;
  first_tradable_date?: string | null;
};

export type RunState = {
  status: "draft" | "ready" | "blocked";
  opening_session?: string | null;
  issues: RunStateIssue[];
};

export type BootstrapConfig = {
  risk_free_rate: number;
  benchmark_ticker: string;
  capabilities: {
    agent: boolean;
    real_estate: boolean;
  };
};

export type AppSettings = {
  database: {
    engine: "sqlite" | "duckdb";
    path: string;
  };
  market: {
    risk_free_rate: number;
    benchmark_ticker: string;
    cache_ttl_days: number;
  };
  agent: {
    endpoint: string;
    model: string;
    api_key: string;
    max_tokens: number;
    temperature: number;
  };
  scheduler: {
    enabled: boolean;
    price_refresh_cron: string;
    zillow_refresh_cron: string;
  };
  real_estate: {
    enabled: boolean;
    metro_csv_url: string;
    zip_csv_url: string;
    cache_ttl_days: number;
    search_limit: number;
  };
  capabilities: {
    agent: boolean;
    real_estate: boolean;
  };
};

export type AppSettingsUpdate = {
  market?: Partial<AppSettings["market"]>;
  agent?: Partial<AppSettings["agent"]>;
  scheduler?: Partial<AppSettings["scheduler"]>;
  real_estate?: Partial<AppSettings["real_estate"]>;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  start_date: string;
  created_at: string;
  book_count: number;
  collection_count: number;
  run_state: RunState;
};

export type WorkspaceDetail = WorkspaceSummary;

export type WorkspaceUpdateRequest = {
  name?: string;
};

export type CollectionCreateRequest = {
  name?: string | null;
  initial_cash: number;
};

export type CollectionUpdateRequest = {
  name?: string;
  initial_cash?: number;
};

export type CollectionSummary = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  initial_cash: number;
  book_count: number;
  run_state: RunState;
};

export type BookAllocationCreate = {
  ticker: string;
  asset_type: "stock" | "etf";
  weight: number;
};

export type BookAllocationPreview = {
  ticker: string;
  asset_type: "stock" | "etf";
  weight: number;
};

export type BookStrategyKind = "preset" | "custom";

export type BookCreateRequest = {
  name: string;
  description: string;
  strategy_kind: BookStrategyKind;
  preset_id?: string | null;
  allocations: BookAllocationCreate[];
  snapshot_as_of?: string;
};

export type BookUpdateRequest = {
  name: string;
  description: string;
  strategy_kind: BookStrategyKind;
  preset_id?: string | null;
  allocations: BookAllocationCreate[];
};

export type BookConfig = {
  id: string;
  workspace_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  name: string;
  description: string;
  strategy_kind: BookStrategyKind;
  preset_id?: string | null;
  allocations: BookAllocationCreate[];
  run_state: RunState;
};

export type BookSummary = {
  id: string;
  workspace_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  name: string;
  description: string;
  created_at: string;
  base_currency: string;
  initial_cash: number;
  open_positions: number;
  total_positions: number;
  strategy_kind: BookStrategyKind;
  preset_id?: string | null;
  allocation_preview: BookAllocationPreview[];
  cash_weight: number;
  run_state: RunState;
};

export type BookMetrics = {
  book_id: string;
  total_value: number;
  current_cash: number;
  simple_roi: number;
  annualized_return: number | null;
  sharpe_ratio: number | null;
  benchmark_sharpe_ratio: number | null;
  relative_sharpe: number | null;
  alpha: number | null;
  beta: number | null;
  benchmark_return: number | null;
  benchmark_ticker: string;
  risk_free_rate: number;
  position_count: number;
  open_position_count: number;
};

export type PositionWithMetrics = {
  id: string;
  book_id: string;
  asset_type: "stock" | "etf" | "real_estate";
  ticker: string;
  shares: number;
  entry_price: number;
  entry_date: string;
  exit_price: number | null;
  exit_date: string | null;
  notes: string;
  status: "open" | "closed";
  current_price: number;
  current_value: number;
  dollar_pnl: number;
  simple_roi: number;
  annualized_return: number | null;
  sharpe_ratio: number | null;
  weight: number;
};

export type AllocationSlice = {
  label: string;
  ticker: string;
  value: number;
  weight: number;
};

export type BookSnapshot = {
  id: string;
  workspace_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  name: string;
  description: string;
  created_at: string;
  base_currency: string;
  initial_cash: number;
  as_of: string;
  metrics: BookMetrics;
  positions: PositionWithMetrics[];
  allocation: AllocationSlice[];
};

export type WorkspaceComparisonPoint = {
  date: string;
  benchmark_values: Record<string, number | null>;
  book_values: Record<string, number>;
};

export type WorkspaceComparisonBenchmarkSeries = {
  key: string;
  ticker: string;
  label: string;
  collection_id?: string | null;
  collection_name?: string | null;
  is_primary: boolean;
  initial_cash: number;
};

export type WorkspaceComparison = {
  workspace_id: string;
  primary_benchmark_ticker: string;
  benchmark_tickers: string[];
  benchmark_series: WorkspaceComparisonBenchmarkSeries[];
  start_date: string;
  end_date: string;
  points: WorkspaceComparisonPoint[];
};

export type WorkspaceComparisonRequest = {
  benchmark_tickers: string[];
  primary_benchmark_ticker?: string | null;
};

export type CollectionDetail = CollectionSummary & {
  books: BookSummary[];
};

export type WorkspaceView = {
  workspace: WorkspaceDetail;
  collections: CollectionDetail[];
};

export type WorkspaceTickerAvailability = {
  ticker: string;
  available: boolean;
  first_tradable_date?: string | null;
};

export type WorkspaceAvailabilityResponse = {
  workspace_id: string;
  opening_session?: string | null;
  issues: RunStateIssue[];
  tickers: WorkspaceTickerAvailability[];
};

export type MarketSearchResult = {
  ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  exchange?: string | null;
};

export type RealEstateSearchResult = {
  ticker: string;
  name: string;
  asset_type: "real_estate";
  region_type: "metro" | "zip";
  city: string;
  state: string;
  metro: string;
};

export type PricePoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

export type ChatHistoryEntry = {
  id: string;
  portfolio_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type PortfolioSummary = BookSummary;
export type PortfolioMetrics = BookMetrics;
export type PortfolioDetail = BookSnapshot;
export type TimeSeriesPoint = {
  date: string;
  book_value: number;
  cash: number;
  benchmark_value: number | null;
};

export class ApiClientError extends Error {
  status: number;
  detail: ApiError;

  constructor(status: number, detail: ApiError) {
    super(detail.message);
    this.status = status;
    this.detail = detail;
  }
}

function extractErrorDetail(payload: { detail?: ApiError | string } | null, fallback: string): ApiError {
  return payload && typeof payload.detail === "object"
    ? payload.detail
    : { code: "request_failed", message: String(payload?.detail ?? fallback) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: ApiError | string }
      | null;
    throw new ApiClientError(response.status, extractErrorDetail(payload, response.statusText));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function parseSseEvent(rawEvent: string): { event: string; data: string } | null {
  const normalized = rawEvent.replace(/\r/g, "");
  const lines = normalized.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export async function streamAgentAnalysis(
  portfolioId: string,
  handlers: {
    onMessage?: (delta: string) => void;
    onDone?: (message: string) => void;
  },
): Promise<void> {
  const response = await fetch("/api/v1/agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ portfolio_id: portfolioId }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: ApiError | string }
      | null;
    throw new ApiClientError(response.status, extractErrorDetail(payload, response.statusText));
  }

  if (!response.body) {
    throw new ApiClientError(500, {
      code: "stream_unavailable",
      message: "Streaming is unavailable in this browser.",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r/g, "");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseEvent(rawEvent);
      if (parsed) {
        let payload:
          | {
              delta?: string;
              message?: string;
              code?: string;
            }
          | undefined;
        try {
          payload = JSON.parse(parsed.data) as
            | { delta?: string; message?: string; code?: string }
            | undefined;
        } catch {
          payload = undefined;
        }
        if (parsed.event === "message" && payload?.delta) {
          handlers.onMessage?.(payload.delta);
        }
        if (parsed.event === "done") {
          handlers.onDone?.(payload?.message ?? "");
        }
        if (parsed.event === "error") {
          throw new ApiClientError(502, {
            code: payload?.code ?? "agent_stream_error",
            message: payload?.message ?? "The configured agent returned an error.",
          });
        }
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }
}

export function buildAgentChatUrl(portfolioId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/v1/agent/chat?portfolio_id=${encodeURIComponent(portfolioId)}`;
}

export const api = {
  getBootstrap: () => request<BootstrapConfig>("/app/bootstrap"),
  getAppSettings: () => request<AppSettings>("/app/settings"),
  updateAppSettings: (payload: AppSettingsUpdate) =>
    request<AppSettings>("/app/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listWorkspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  createWorkspace: (payload: { start_date: string }) =>
    request<WorkspaceDetail>("/workspaces", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspace: (workspaceId: string, payload: WorkspaceUpdateRequest) =>
    request<WorkspaceDetail>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getWorkspace: (workspaceId: string) => request<WorkspaceDetail>(`/workspaces/${workspaceId}`),
  getWorkspaceView: (workspaceId: string, signal?: AbortSignal) =>
    request<WorkspaceView>(`/workspaces/${workspaceId}/view`, { signal }),
  deleteWorkspace: (workspaceId: string) =>
    request<void>(`/workspaces/${workspaceId}`, { method: "DELETE" }),
  createCollection: (workspaceId: string, payload: CollectionCreateRequest) =>
    request<CollectionSummary>(`/workspaces/${workspaceId}/collections`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCollection: (collectionId: string, payload: CollectionUpdateRequest) =>
    request<CollectionSummary>(`/collections/${collectionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCollection: (collectionId: string) =>
    request<void>(`/collections/${collectionId}`, { method: "DELETE" }),
  listBooks: (workspaceId: string) => request<BookSummary[]>(`/workspaces/${workspaceId}/books`),
  createBook: (collectionId: string, payload: BookCreateRequest) =>
    request<BookSummary>(`/collections/${collectionId}/books`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBookConfig: (bookId: string, signal?: AbortSignal) => request<BookConfig>(`/books/${bookId}/config`, { signal }),
  updateBook: (bookId: string, payload: BookUpdateRequest) =>
    request<BookSummary>(`/books/${bookId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBook: (bookId: string) => request<void>(`/books/${bookId}`, { method: "DELETE" }),
  getWorkspaceAvailability: (workspaceId: string, tickers: string[], signal?: AbortSignal) =>
    request<WorkspaceAvailabilityResponse>(`/workspaces/${workspaceId}/availability`, {
      method: "POST",
      signal,
      body: JSON.stringify({ tickers }),
    }),
  getWorkspaceComparison: (workspaceId: string, payload: WorkspaceComparisonRequest, signal?: AbortSignal) =>
    request<WorkspaceComparison>(`/workspaces/${workspaceId}/comparison`, {
      method: "POST",
      signal,
      body: JSON.stringify(payload),
    }),
  getBookSnapshot: (bookId: string, asOf: string, benchmarkTicker?: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ as_of: asOf });
    if (benchmarkTicker) {
      params.set("benchmark_ticker", benchmarkTicker);
    }
    return request<BookSnapshot>(`/books/${bookId}/snapshot?${params.toString()}`, { signal });
  },
  searchMarket: (query: string, signal?: AbortSignal) =>
    request<MarketSearchResult[]>(`/market/search?q=${encodeURIComponent(query)}`, { signal }),
  searchRealEstate: (query: string) =>
    request<RealEstateSearchResult[]>(`/market/real-estate/search?q=${encodeURIComponent(query)}`),
  getAgentHistory: (portfolioId: string) =>
    request<ChatHistoryEntry[]>(`/agent/history/${encodeURIComponent(portfolioId)}`),
  clearAgentHistory: (portfolioId: string) =>
    request<void>(`/agent/history/${encodeURIComponent(portfolioId)}`, { method: "DELETE" }),
  getMarketHistory: (ticker: string, fromDate: string, toDate: string) =>
    request<PricePoint[]>(
      `/market/history/${ticker}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
    ),
};
