from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ApiError(ApiModel):
    code: str
    message: str


class WorkspaceCreate(ApiModel):
    start_date: date


class WorkspaceBenchmark(ApiModel):
    ticker: str
    is_primary: bool


class WorkspaceUpdate(ApiModel):
    initial_cash: Decimal | None = Field(default=None, gt=0)
    benchmark_tickers: list[str] | None = None
    primary_benchmark_ticker: str | None = None


class WorkspaceSummary(ApiModel):
    id: str
    name: str
    start_date: date
    created_at: datetime
    book_count: int


class WorkspaceDetail(ApiModel):
    id: str
    name: str
    start_date: date
    created_at: datetime
    book_count: int
    initial_cash: float
    benchmarks: list[WorkspaceBenchmark]


class BookAllocationCreate(ApiModel):
    ticker: str = Field(min_length=1, max_length=32)
    asset_type: Literal["stock", "etf"]
    weight: Decimal = Field(ge=0, le=100)


class BookAllocationPreview(ApiModel):
    ticker: str
    asset_type: Literal["stock", "etf"]
    weight: float


BookStrategyKind = Literal["preset", "custom"]


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
    name: str
    description: str
    strategy_kind: BookStrategyKind
    preset_id: str | None = None
    allocations: list[BookAllocationCreate]


class BookSummary(ApiModel):
    id: str
    workspace_id: str
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


class PositionCreate(PositionBase):
    entry_date: date


class PositionUpdate(ApiModel):
    notes: str | None = None
    close: bool = False


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
    name: str
    description: str
    created_at: datetime
    base_currency: str
    initial_cash: float
    as_of: date
    metrics: BookMetrics
    positions: list[PositionWithMetrics]
    allocation: list[AllocationSlice]


class WorkspaceComparisonPoint(ApiModel):
    date: date
    benchmark_values: dict[str, float | None]
    book_values: dict[str, float]


class WorkspaceComparison(ApiModel):
    workspace_id: str
    primary_benchmark_ticker: str
    benchmark_tickers: list[str]
    start_date: date
    end_date: date
    points: list[WorkspaceComparisonPoint]


class WorkspaceView(ApiModel):
    workspace: WorkspaceDetail
    books: list[BookSummary]
    comparison: WorkspaceComparison


class BookCreateResult(ApiModel):
    book: BookSummary
    workspace_view: WorkspaceView
    snapshot: BookSnapshot


PortfolioAllocationCreate = BookAllocationCreate
PortfolioCreate = BookCreate
PortfolioSummary = BookSummary
PortfolioMetrics = BookMetrics
TimeSeriesPoint = BookTimeSeriesPoint
PortfolioDetail = BookSnapshot


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


class AppSettings(ApiModel):
    database: AppSettingsDatabase
    market: AppSettingsMarket
    agent: AppSettingsAgent
    scheduler: AppSettingsScheduler
    real_estate: AppSettingsRealEstate
    capabilities: dict[str, bool]


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


class AnalyzeRequest(ApiModel):
    portfolio_id: str


class AnalyzeResponse(ApiModel):
    detail: ApiError


class ChatHistoryEntry(ApiModel):
    id: str
    portfolio_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


def decimal_to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


class DecimalFriendlyModel(ApiModel):
    @field_serializer("*", when_used="json", check_fields=False)
    def serialize(self, value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        return value
