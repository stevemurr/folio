from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ApiError(ApiModel):
    code: str
    message: str


RunStateStatus = Literal["draft", "ready", "blocked"]
BookStrategyKind = Literal["preset", "custom"]


class RunStateIssue(ApiModel):
    code: str
    message: str
    ticker: str | None = None
    first_tradable_date: date | None = None


class RunState(ApiModel):
    status: RunStateStatus
    opening_session: date | None = None
    issues: list[RunStateIssue] = Field(default_factory=list)


class WorkspaceCreate(ApiModel):
    start_date: date


class WorkspaceUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class WorkspaceSummary(ApiModel):
    id: str
    name: str
    start_date: date
    created_at: datetime
    book_count: int
    collection_count: int
    run_state: RunState


class WorkspaceDetail(ApiModel):
    id: str
    name: str
    start_date: date
    created_at: datetime
    book_count: int
    collection_count: int
    run_state: RunState


class CollectionCreate(ApiModel):
    name: str | None = Field(default=None, max_length=120)
    initial_cash: Decimal = Field(gt=0)


class CollectionUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    initial_cash: Decimal | None = Field(default=None, gt=0)


class CollectionSummary(ApiModel):
    id: str
    workspace_id: str
    name: str
    created_at: datetime
    initial_cash: float
    book_count: int
    run_state: RunState


class BookAllocationCreate(ApiModel):
    ticker: str = Field(min_length=1, max_length=32)
    asset_type: Literal["stock", "etf"]
    weight: Decimal = Field(ge=0, le=100)


class BookAllocationPreview(ApiModel):
    ticker: str
    asset_type: Literal["stock", "etf"]
    weight: float


class BookCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    strategy_kind: BookStrategyKind = "custom"
    preset_id: str | None = Field(default=None, max_length=64)
    allocations: list[BookAllocationCreate]
    snapshot_as_of: date | None = None


class BookUpdate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    strategy_kind: BookStrategyKind = "custom"
    preset_id: str | None = Field(default=None, max_length=64)
    allocations: list[BookAllocationCreate]


class BookConfig(ApiModel):
    id: str
    workspace_id: str
    collection_id: str | None = None
    collection_name: str | None = None
    name: str
    description: str
    strategy_kind: BookStrategyKind
    preset_id: str | None = None
    allocations: list[BookAllocationCreate]
    run_state: RunState


class BookSummary(ApiModel):
    id: str
    workspace_id: str
    collection_id: str | None = None
    collection_name: str | None = None
    name: str
    description: str
    created_at: datetime
    base_currency: str
    initial_cash: float
    open_positions: int
    total_positions: int
    strategy_kind: BookStrategyKind
    preset_id: str | None = None
    allocation_preview: list[BookAllocationPreview]
    cash_weight: float
    run_state: RunState


class CollectionDetail(CollectionSummary):
    books: list[BookSummary]


class BookMetrics(ApiModel):
    book_id: str
    total_value: float
    current_cash: float
    simple_roi: float
    annualized_return: float | None
    sharpe_ratio: float | None
    benchmark_sharpe_ratio: float | None
    relative_sharpe: float | None
    alpha: float | None
    beta: float | None
    benchmark_return: float | None
    benchmark_ticker: str
    risk_free_rate: float
    position_count: int
    open_position_count: int


class PositionBase(ApiModel):
    asset_type: Literal["stock", "etf", "real_estate"]
    ticker: str = Field(min_length=1, max_length=32)
    shares: Decimal = Field(gt=0)
    notes: str = ""


class PositionWithMetrics(ApiModel):
    id: str
    book_id: str
    asset_type: str
    ticker: str
    shares: float
    entry_price: float
    entry_date: date
    exit_price: float | None
    exit_date: date | None
    notes: str
    status: Literal["open", "closed"]
    current_price: float
    current_value: float
    dollar_pnl: float
    simple_roi: float
    annualized_return: float | None
    sharpe_ratio: float | None
    weight: float


class BookTimeSeriesPoint(ApiModel):
    date: date
    book_value: float
    cash: float
    benchmark_value: float | None = None


class AllocationSlice(ApiModel):
    label: str
    ticker: str
    value: float
    weight: float


class BookSnapshot(ApiModel):
    id: str
    workspace_id: str
    collection_id: str | None = None
    collection_name: str | None = None
    name: str
    description: str
    created_at: datetime
    base_currency: str
    initial_cash: float
    as_of: date
    metrics: BookMetrics
    positions: list[PositionWithMetrics]
    allocation: list[AllocationSlice]


class WorkspaceComparisonBenchmarkSeries(ApiModel):
    key: str
    ticker: str
    label: str
    collection_id: str | None = None
    collection_name: str | None = None
    is_primary: bool
    initial_cash: float


class WorkspaceComparisonPoint(ApiModel):
    date: date
    benchmark_values: dict[str, float | None]
    book_values: dict[str, float]


class WorkspaceComparison(ApiModel):
    workspace_id: str
    primary_benchmark_ticker: str
    benchmark_tickers: list[str]
    benchmark_series: list[WorkspaceComparisonBenchmarkSeries] = Field(default_factory=list)
    start_date: date
    end_date: date
    points: list[WorkspaceComparisonPoint]


class WorkspaceComparisonRequest(ApiModel):
    benchmark_tickers: list[str] = Field(default_factory=list)
    primary_benchmark_ticker: str | None = None


class WorkspaceView(ApiModel):
    workspace: WorkspaceDetail
    collections: list[CollectionDetail]


class WorkspaceAvailabilityRequest(ApiModel):
    tickers: list[str] = Field(default_factory=list)


class WorkspaceTickerAvailability(ApiModel):
    ticker: str
    available: bool
    first_tradable_date: date | None = None


class WorkspaceAvailabilityResponse(ApiModel):
    workspace_id: str
    opening_session: date | None = None
    issues: list[RunStateIssue] = Field(default_factory=list)
    tickers: list[WorkspaceTickerAvailability]


class AnalyzeRequest(ApiModel):
    portfolio_id: str


class ChatHistoryEntry(ApiModel):
    id: str
    portfolio_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class MarketSearchResult(ApiModel):
    ticker: str
    name: str
    asset_type: Literal["stock", "etf"]
    exchange: str | None = None


class RealEstateSearchResult(ApiModel):
    ticker: str
    name: str
    asset_type: Literal["real_estate"] = "real_estate"
    region_type: Literal["metro", "zip"]
    city: str = ""
    state: str = ""
    metro: str = ""


class PricePoint(ApiModel):
    date: date
    open: float | None
    high: float | None
    low: float | None
    close: float
    volume: int | None


class MarketPriceResponse(ApiModel):
    ticker: str
    price: float
    previous_close: float | None
    change: float | None
    change_percent: float | None
    as_of: date


class BootstrapConfig(ApiModel):
    risk_free_rate: float
    benchmark_ticker: str
    capabilities: dict[str, bool]


class AppSettingsDatabase(ApiModel):
    engine: Literal["sqlite", "duckdb"]
    path: str


class AppSettingsMarket(ApiModel):
    risk_free_rate: float
    benchmark_ticker: str
    cache_ttl_days: int


class AppSettingsAgent(ApiModel):
    endpoint: str
    model: str
    api_key: str
    max_tokens: int
    temperature: float


class AppSettingsScheduler(ApiModel):
    enabled: bool
    price_refresh_cron: str
    zillow_refresh_cron: str


class AppSettingsRealEstate(ApiModel):
    enabled: bool
    metro_csv_url: str
    zip_csv_url: str
    cache_ttl_days: int
    search_limit: int


class AppSettingsCapabilities(ApiModel):
    agent: bool
    real_estate: bool


class AppSettings(ApiModel):
    database: AppSettingsDatabase
    market: AppSettingsMarket
    agent: AppSettingsAgent
    scheduler: AppSettingsScheduler
    real_estate: AppSettingsRealEstate
    capabilities: AppSettingsCapabilities


class AppSettingsMarketUpdate(ApiModel):
    risk_free_rate: float | None = None
    benchmark_ticker: str | None = None
    cache_ttl_days: int | None = None


class AppSettingsAgentUpdate(ApiModel):
    endpoint: str | None = None
    model: str | None = None
    api_key: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None


class AppSettingsSchedulerUpdate(ApiModel):
    enabled: bool | None = None
    price_refresh_cron: str | None = None
    zillow_refresh_cron: str | None = None


class AppSettingsRealEstateUpdate(ApiModel):
    enabled: bool | None = None
    metro_csv_url: str | None = None
    zip_csv_url: str | None = None
    cache_ttl_days: int | None = None
    search_limit: int | None = None


class AppSettingsUpdate(ApiModel):
    market: AppSettingsMarketUpdate | None = None
    agent: AppSettingsAgentUpdate | None = None
    scheduler: AppSettingsSchedulerUpdate | None = None
    real_estate: AppSettingsRealEstateUpdate | None = None
