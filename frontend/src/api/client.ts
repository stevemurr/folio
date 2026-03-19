export type ApiError = {
  code: string;
  message: string;
};

export type BootstrapConfig = {
  risk_free_rate: number;
  benchmark_ticker: string;
  capabilities: {
    agent: boolean;
    real_estate: boolean;
  };
};

export type PortfolioSummary = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  base_currency: string;
  initial_cash: number;
  open_positions: number;
  total_positions: number;
};

export type PortfolioMetrics = {
  portfolio_id: string;
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
  portfolio_id: string;
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

export type PortfolioDetail = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  base_currency: string;
  initial_cash: number;
  metrics: PortfolioMetrics;
  positions: PositionWithMetrics[];
};

export type AllocationSlice = {
  label: string;
  ticker: string;
  value: number;
  weight: number;
};

export type TimeSeriesPoint = {
  date: string;
  portfolio_value: number;
  cash: number;
  benchmark_value: number | null;
};

export type MarketSearchResult = {
  ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  exchange?: string | null;
};

export type PricePoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
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
    const detail =
      payload && typeof payload.detail === "object"
        ? payload.detail
        : { code: "request_failed", message: String(payload?.detail ?? response.statusText) };
    throw new ApiClientError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getBootstrap: () => request<BootstrapConfig>("/app/bootstrap"),
  listPortfolios: () => request<PortfolioSummary[]>("/portfolios"),
  createPortfolio: (payload: { name: string; description: string; initial_cash: number }) =>
    request<PortfolioSummary>("/portfolios", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deletePortfolio: (portfolioId: string) =>
    request<void>(`/portfolios/${portfolioId}`, { method: "DELETE" }),
  getPortfolio: (portfolioId: string) => request<PortfolioDetail>(`/portfolios/${portfolioId}`),
  getTimeseries: (portfolioId: string) =>
    request<TimeSeriesPoint[]>(`/portfolios/${portfolioId}/timeseries`),
  getAllocation: (portfolioId: string) =>
    request<AllocationSlice[]>(`/portfolios/${portfolioId}/allocation`),
  searchMarket: (query: string) =>
    request<MarketSearchResult[]>(`/market/search?q=${encodeURIComponent(query)}`),
  addPosition: (
    portfolioId: string,
    payload: {
      asset_type: "stock" | "etf" | "real_estate";
      ticker: string;
      entry_date: string;
      shares: number;
      notes: string;
    },
  ) =>
    request<PositionWithMetrics>(`/portfolios/${portfolioId}/positions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePosition: (positionId: string, payload: { notes?: string; close?: boolean }) =>
    request<PositionWithMetrics>(`/positions/${positionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getMarketHistory: (ticker: string, fromDate: string, toDate: string) =>
    request<PricePoint[]>(
      `/market/history/${ticker}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
    ),
};

