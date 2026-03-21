from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from math import sqrt

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import Portfolio, Position
from backend.models.schemas import (
    AllocationSlice,
    BookMetrics,
    BookSnapshot,
    BookTimeSeriesPoint,
    PositionWithMetrics,
)
from backend.services.app_config_service import get_runtime_settings
from backend.services.market_data import MarketDataService


@dataclass
class PortfolioAnalysis:
    metrics: BookMetrics
    positions: list[PositionWithMetrics]
    timeseries: list[BookTimeSeriesPoint]
    allocation: list[AllocationSlice]


class PortfolioEngine:
    def __init__(self, session: Session):
        self.session = session
        self.settings = get_runtime_settings(session)
        self.market_data = MarketDataService(session)

    def get_portfolio(self, portfolio_id: str) -> Portfolio:
        portfolio = self.session.get(Portfolio, portfolio_id)
        if portfolio is None:
            raise ApiErrorException(404, "book_not_found", "Book not found.")
        return portfolio

    def build_portfolio_detail(
        self,
        portfolio_id: str,
        *,
        as_of: date | None = None,
        start_date: date | None = None,
    ) -> BookSnapshot:
        portfolio = self.get_portfolio(portfolio_id)
        effective_start_date = start_date or self._default_start_date(portfolio, as_of or date.today())
        analysis = self.analyze_portfolio(portfolio, as_of=as_of, start_date=effective_start_date)
        effective_as_of = as_of or date.today()
        if analysis.timeseries:
            effective_as_of = analysis.timeseries[-1].date
        return BookSnapshot(
            id=portfolio.id,
            workspace_id=portfolio.workspace_id,
            name=portfolio.name,
            description=portfolio.description,
            created_at=portfolio.created_at,
            base_currency=portfolio.base_currency,
            initial_cash=float(portfolio.initial_cash),
            as_of=effective_as_of,
            metrics=analysis.metrics,
            positions=analysis.positions,
            allocation=analysis.allocation,
        )

    def analyze_portfolio(
        self,
        portfolio: Portfolio,
        *,
        as_of: date | None = None,
        start_date: date | None = None,
        benchmark_ticker: str | None = None,
        price_frame: pd.DataFrame | None = None,
    ) -> PortfolioAnalysis:
        positions = sorted(portfolio.positions, key=lambda item: (item.entry_date, item.id))
        initial_cash = float(portfolio.initial_cash)
        benchmark_ticker = benchmark_ticker or self._benchmark_ticker_for_portfolio(portfolio)
        risk_free_rate = self.settings.market.risk_free_rate / 100
        effective_as_of = min(as_of or date.today(), date.today())
        effective_start_date = start_date or self._default_start_date(portfolio, effective_as_of)

        if effective_as_of < effective_start_date:
            raise ApiErrorException(422, "invalid_as_of", "Snapshot date cannot be earlier than the book start date.")

        if price_frame is None:
            tracked_tickers = sorted({position.ticker for position in positions} | {benchmark_ticker})
            price_frame = self.market_data.load_price_frame(tracked_tickers, effective_start_date, effective_as_of)
        else:
            price_frame = price_frame.loc[
                (price_frame.index >= pd.Timestamp(effective_start_date))
                & (price_frame.index <= pd.Timestamp(effective_as_of))
            ].copy()

        if price_frame.empty or benchmark_ticker not in price_frame:
            if self._should_return_cash_only(portfolio, benchmark_ticker, effective_start_date, effective_as_of):
                return self._cash_only_analysis(
                    portfolio,
                    initial_cash=initial_cash,
                    benchmark_ticker=benchmark_ticker,
                    snapshot_date=effective_as_of,
                )
            raise ApiErrorException(503, "market_data_unavailable", "Benchmark market data is unavailable.")

        calendar = price_frame[benchmark_ticker].dropna().index.sort_values()
        if calendar.empty:
            raise ApiErrorException(503, "market_data_unavailable", "No market calendar is available.")
        price_frame = price_frame.reindex(calendar)
        for ticker in price_frame.columns:
            price_frame[ticker] = price_frame[ticker].ffill()

        cash_flows = pd.Series(0.0, index=calendar)
        position_values = pd.DataFrame(index=calendar)

        for position in positions:
            if position.ticker not in price_frame:
                raise ApiErrorException(
                    503,
                    "market_data_unavailable",
                    f"Market data is unavailable for {position.ticker}.",
                )
            shares = float(position.shares)
            entry_idx = self._calendar_index(calendar, position.entry_date)
            exit_idx = len(calendar)
            if position.exit_date is not None:
                exit_idx = self._calendar_index(calendar, position.exit_date)
            units = pd.Series(0.0, index=calendar)
            units.iloc[entry_idx:exit_idx] = shares
            position_values[position.id] = units * price_frame[position.ticker]
            if entry_idx < len(calendar):
                cash_flows.iloc[entry_idx] -= float(position.entry_price) * shares
            if position.exit_date is not None and position.exit_price is not None and exit_idx < len(calendar):
                cash_flows.iloc[exit_idx] += float(position.exit_price) * shares

        if position_values.empty:
            position_values = pd.DataFrame(0.0, index=calendar, columns=[])

        cash_series = pd.Series(initial_cash, index=calendar) + cash_flows.cumsum()
        portfolio_values = cash_series + position_values.sum(axis=1)

        benchmark_series = price_frame[benchmark_ticker].ffill()
        benchmark_start = benchmark_series.iloc[0]
        benchmark_values = None
        if benchmark_start and not np.isnan(benchmark_start):
            benchmark_values = (benchmark_series / benchmark_start) * initial_cash

        portfolio_returns = portfolio_values.pct_change().dropna()
        benchmark_returns = benchmark_values.pct_change().dropna() if benchmark_values is not None else pd.Series(dtype=float)

        portfolio_sharpe = self._compute_sharpe(portfolio_returns, risk_free_rate)
        benchmark_sharpe = self._compute_sharpe(benchmark_returns, risk_free_rate)
        alpha, beta = self._compute_alpha_beta(portfolio_returns, benchmark_returns, risk_free_rate)

        total_value = float(portfolio_values.iloc[-1])
        current_cash = float(cash_series.iloc[-1])
        simple_roi = (total_value - initial_cash) / initial_cash if initial_cash else 0.0
        days_held = max((calendar[-1].date() - calendar[0].date()).days, 0)
        annualized_return = self._annualized_return(initial_cash, total_value, days_held)
        benchmark_return = None
        if benchmark_values is not None and not benchmark_values.empty:
            benchmark_return = float((benchmark_values.iloc[-1] / benchmark_values.iloc[0]) - 1)

        position_metrics: list[PositionWithMetrics] = []
        realized_position_count = 0
        open_positions = 0
        snapshot_date = calendar[-1].date()

        for position in positions:
            if position.entry_date > snapshot_date:
                continue

            realized_position_count += 1
            shares = float(position.shares)
            is_closed = position.exit_date is not None and position.exit_date <= snapshot_date
            is_open = not is_closed
            if is_open:
                open_positions += 1

            if is_closed and position.exit_price is not None:
                current_price = float(position.exit_price)
                effective_end = position.exit_date
            else:
                current_price = float(price_frame[position.ticker].ffill().iloc[-1])
                effective_end = snapshot_date

            current_value = shares * current_price if is_open else shares * current_price
            pnl = (current_price - float(position.entry_price)) * shares
            roi = (current_price - float(position.entry_price)) / float(position.entry_price)
            position_days = max((effective_end - position.entry_date).days, 0)
            position_ann_return = self._annualized_return(float(position.entry_price), current_price, position_days)
            series_start = self._calendar_index(calendar, position.entry_date)
            series_end = len(calendar) if position.exit_date is None else min(self._calendar_index(calendar, position.exit_date), len(calendar))
            position_returns = price_frame[position.ticker].iloc[series_start:series_end].pct_change().dropna()
            position_sharpe = self._compute_sharpe(position_returns, risk_free_rate)
            weight = current_value / total_value if is_open and total_value else 0.0
            position_metrics.append(
                PositionWithMetrics(
                    id=position.id,
                    book_id=position.portfolio_id,
                    asset_type=position.asset_type,
                    ticker=position.ticker,
                    shares=shares,
                    entry_price=float(position.entry_price),
                    entry_date=position.entry_date,
                    exit_price=float(position.exit_price) if position.exit_price is not None else None,
                    exit_date=position.exit_date,
                    notes=position.notes,
                    status="closed" if is_closed else "open",
                    current_price=current_price,
                    current_value=current_value,
                    dollar_pnl=pnl,
                    simple_roi=roi,
                    annualized_return=position_ann_return,
                    sharpe_ratio=position_sharpe,
                    weight=weight,
                )
            )

        timeseries = [
            BookTimeSeriesPoint(
                date=timestamp.date(),
                book_value=float(portfolio_values.loc[timestamp]),
                cash=float(cash_series.loc[timestamp]),
                benchmark_value=float(benchmark_values.loc[timestamp]) if benchmark_values is not None else None,
            )
            for timestamp in calendar
        ]

        allocation = self._build_allocation(position_metrics, current_cash, total_value)
        metrics = BookMetrics(
            book_id=portfolio.id,
            total_value=total_value,
            current_cash=current_cash,
            simple_roi=simple_roi,
            annualized_return=annualized_return,
            sharpe_ratio=portfolio_sharpe,
            benchmark_sharpe_ratio=benchmark_sharpe,
            relative_sharpe=(
                None
                if portfolio_sharpe is None or benchmark_sharpe is None
                else portfolio_sharpe - benchmark_sharpe
            ),
            alpha=alpha,
            beta=beta,
            benchmark_return=benchmark_return,
            benchmark_ticker=benchmark_ticker,
            risk_free_rate=self.settings.market.risk_free_rate,
            position_count=realized_position_count,
            open_position_count=open_positions,
        )
        return PortfolioAnalysis(
            metrics=metrics,
            positions=position_metrics,
            timeseries=timeseries,
            allocation=allocation,
        )

    def analyze_portfolios(
        self,
        portfolios: list[Portfolio],
        *,
        start_date: date,
        as_of: date | None = None,
        primary_benchmark_ticker: str | None = None,
        benchmark_tickers: list[str] | None = None,
        price_frame: pd.DataFrame | None = None,
    ) -> dict[str, PortfolioAnalysis]:
        if not portfolios:
            return {}

        primary_benchmark_ticker = primary_benchmark_ticker or self._benchmark_ticker_for_portfolio(portfolios[0])
        tracked_tickers = sorted(
            {position.ticker for portfolio in portfolios for position in portfolio.positions}
            | set(benchmark_tickers or [primary_benchmark_ticker])
        )
        effective_as_of = min(as_of or date.today(), date.today())
        shared_frame = (
            price_frame
            if price_frame is not None
            else self.market_data.load_price_frame(tracked_tickers, start_date, effective_as_of)
        )
        return {
            portfolio.id: self.analyze_portfolio(
                portfolio,
                as_of=as_of,
                start_date=start_date,
                benchmark_ticker=primary_benchmark_ticker,
                price_frame=shared_frame,
            )
            for portfolio in portfolios
        }

    def assert_cash_valid(self, portfolio: Portfolio, positions: list[Position]) -> None:
        cash = float(portfolio.initial_cash)
        events: list[tuple[date, int, float]] = []
        for position in positions:
            cost = float(position.entry_price) * float(position.shares)
            events.append((position.entry_date, 1, -cost))
            if position.exit_date is not None and position.exit_price is not None:
                events.append((position.exit_date, 0, float(position.exit_price) * float(position.shares)))

        for event_date, _, delta in sorted(events, key=lambda item: (item[0], item[1])):
            cash += delta
            if cash < -1e-6:
                raise ApiErrorException(
                    409,
                    "insufficient_cash",
                    f"Book cash would become negative on {event_date.isoformat()}.",
                )

    def _build_allocation(
        self,
        positions: list[PositionWithMetrics],
        current_cash: float,
        total_value: float,
    ) -> list[AllocationSlice]:
        slices = [
            AllocationSlice(
                label=position.ticker,
                ticker=position.ticker,
                value=position.current_value,
                weight=position.current_value / total_value if total_value else 0.0,
            )
            for position in positions
            if position.status == "open"
        ]
        if current_cash > 0:
            slices.append(
                AllocationSlice(
                    label="Cash",
                    ticker="CASH",
                    value=current_cash,
                    weight=current_cash / total_value if total_value else 0.0,
                )
            )
        return sorted(slices, key=lambda item: item.value, reverse=True)

    def _calendar_index(self, calendar: pd.Index, target_date: date) -> int:
        timestamp = pd.Timestamp(target_date)
        index = calendar.searchsorted(timestamp, side="left")
        return int(index)

    def _cash_only_analysis(
        self,
        portfolio: Portfolio,
        *,
        initial_cash: float,
        benchmark_ticker: str,
        snapshot_date: date,
    ) -> PortfolioAnalysis:
        metrics = BookMetrics(
            book_id=portfolio.id,
            total_value=initial_cash,
            current_cash=initial_cash,
            simple_roi=0.0,
            annualized_return=None,
            sharpe_ratio=None,
            benchmark_sharpe_ratio=None,
            relative_sharpe=None,
            alpha=None,
            beta=None,
            benchmark_return=None,
            benchmark_ticker=benchmark_ticker,
            risk_free_rate=self.settings.market.risk_free_rate,
            position_count=0,
            open_position_count=0,
        )
        return PortfolioAnalysis(
            metrics=metrics,
            positions=[],
            timeseries=[],
            allocation=[
                AllocationSlice(
                    label="Cash",
                    ticker="CASH",
                    value=initial_cash,
                    weight=1.0,
                )
            ],
        )

    def _default_start_date(self, portfolio: Portfolio, fallback: date) -> date:
        if portfolio.workspace is not None:
            return portfolio.workspace.start_date
        if portfolio.positions:
            return min(position.entry_date for position in portfolio.positions)
        return fallback

    def _benchmark_ticker_for_portfolio(self, portfolio: Portfolio) -> str:
        workspace = portfolio.workspace
        if workspace is not None:
            for benchmark in workspace.benchmarks:
                if benchmark.is_primary:
                    return benchmark.ticker
            if workspace.benchmarks:
                return workspace.benchmarks[0].ticker
        return self.settings.market.benchmark_ticker.upper()

    def _should_return_cash_only(
        self,
        portfolio: Portfolio,
        benchmark_ticker: str,
        effective_start_date: date,
        effective_as_of: date,
    ) -> bool:
        if portfolio.workspace is None:
            return False
        try:
            next_market_day = self.market_data.resolve_price_on_or_after(benchmark_ticker, effective_start_date).date
        except ApiErrorException:
            return False
        return effective_as_of < next_market_day

    def _compute_sharpe(self, returns: pd.Series, risk_free_rate: float) -> float | None:
        if len(returns) < 30:
            return None
        daily_risk_free = risk_free_rate / 252
        excess = returns - daily_risk_free
        std = excess.std()
        if std == 0 or np.isnan(std):
            return None
        return float((excess.mean() / std) * sqrt(252))

    def _compute_alpha_beta(
        self,
        portfolio_returns: pd.Series,
        benchmark_returns: pd.Series,
        risk_free_rate: float,
    ) -> tuple[float | None, float | None]:
        if portfolio_returns.empty or benchmark_returns.empty:
            return None, None
        aligned = pd.concat([portfolio_returns, benchmark_returns], axis=1, join="inner").dropna()
        if len(aligned) < 2:
            return None, None
        portfolio_series = aligned.iloc[:, 0]
        benchmark_series = aligned.iloc[:, 1]
        benchmark_variance = benchmark_series.var()
        if benchmark_variance == 0 or np.isnan(benchmark_variance):
            return None, None
        beta = float(portfolio_series.cov(benchmark_series) / benchmark_variance)
        daily_risk_free = risk_free_rate / 252
        alpha = float(
            ((portfolio_series.mean() - daily_risk_free) - beta * (benchmark_series.mean() - daily_risk_free))
            * 252
        )
        return alpha, beta

    def _annualized_return(self, start_value: float, end_value: float, days_held: int) -> float | None:
        if days_held <= 0 or start_value <= 0 or end_value <= 0:
            return None
        return float((end_value / start_value) ** (365 / days_held) - 1)
