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
