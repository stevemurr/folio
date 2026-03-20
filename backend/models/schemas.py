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


class PortfolioCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    initial_cash: Decimal = Field(gt=0)


class PortfolioSummary(ApiModel):
    id: str
    name: str
    description: str
    created_at: datetime
    base_currency: str
    initial_cash: float
    open_positions: int
    total_positions: int


class PortfolioMetrics(ApiModel):
    portfolio_id: str
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
    portfolio_id: str
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


class TimeSeriesPoint(ApiModel):
    date: date
    portfolio_value: float
    cash: float
    benchmark_value: float | None = None


class AllocationSlice(ApiModel):
    label: str
    ticker: str
    value: float
    weight: float


class PortfolioDetail(ApiModel):
    id: str
    name: str
    description: str
    created_at: datetime
    base_currency: str
    initial_cash: float
    metrics: PortfolioMetrics
    positions: list[PositionWithMetrics]


class MarketSearchResult(ApiModel):
    ticker: str
    name: str
    asset_type: Literal["stock", "etf"]
    exchange: str | None = None


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
