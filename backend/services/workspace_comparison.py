from __future__ import annotations

from datetime import date
from decimal import Decimal

import pandas as pd

from backend.models.db import BookCollection, Workspace
from backend.models.schemas import (
    WorkspaceComparison,
    WorkspaceComparisonBenchmarkSeries,
    WorkspaceComparisonRequest,
)


def normalize_benchmark_tickers(tickers: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for ticker in tickers:
        cleaned = ticker.strip().upper()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)
    return normalized


def resolve_comparison_request(payload: WorkspaceComparisonRequest, default_ticker: str) -> tuple[list[str], str]:
    normalized = normalize_benchmark_tickers(payload.benchmark_tickers)
    primary = payload.primary_benchmark_ticker.strip().upper() if payload.primary_benchmark_ticker else default_ticker
    if not normalized:
        normalized = [primary]
    elif primary not in normalized:
        normalized = [primary, *normalized]
    return normalized, primary


def benchmark_series(
    collections: list[BookCollection],
    benchmark_tickers: list[str],
    primary_benchmark_ticker: str,
) -> list[WorkspaceComparisonBenchmarkSeries]:
    bankrolls: list[Decimal] = []
    seen_bankroll_keys: set[str] = set()
    for collection in collections:
        bankroll_key = decimal_key(collection.initial_cash)
        if bankroll_key in seen_bankroll_keys:
            continue
        seen_bankroll_keys.add(bankroll_key)
        bankrolls.append(collection.initial_cash)

    include_bankroll_in_label = len(bankrolls) > 1
    series: list[WorkspaceComparisonBenchmarkSeries] = []
    for bankroll in bankrolls:
        bankroll_key = decimal_key(bankroll)
        for ticker in benchmark_tickers:
            series.append(
                WorkspaceComparisonBenchmarkSeries(
                    key=f"{bankroll_key}:{ticker}",
                    ticker=ticker,
                    label=f"{ticker} · {format_currency_label(bankroll)}" if include_bankroll_in_label else ticker,
                    is_primary=ticker == primary_benchmark_ticker,
                    initial_cash=float(bankroll),
                )
            )
    return series


def benchmark_overlay_values(
    shared_frame: pd.DataFrame,
    calendar: pd.Index,
    benchmark_items: list[WorkspaceComparisonBenchmarkSeries],
) -> dict[str, list[float | None]]:
    reindexed_frame = shared_frame.reindex(calendar)
    for ticker in reindexed_frame.columns:
        reindexed_frame[ticker] = reindexed_frame[ticker].ffill()

    values: dict[str, list[float | None]] = {}
    for series in benchmark_items:
        if series.ticker not in reindexed_frame:
            values[series.key] = [None for _ in calendar]
            continue

        ticker_series = reindexed_frame[series.ticker]
        first_valid_at = ticker_series.first_valid_index()
        if first_valid_at is None:
            values[series.key] = [None for _ in calendar]
            continue

        start_value = ticker_series.loc[first_valid_at]
        if pd.isna(start_value) or not start_value:
            values[series.key] = [None for _ in calendar]
            continue

        series_values: list[float | None] = []
        activated = False
        for timestamp in calendar:
            if not activated and timestamp == first_valid_at:
                activated = True
            price = ticker_series.loc[timestamp]
            if not activated or pd.isna(price):
                series_values.append(None)
                continue
            series_values.append(float((price / start_value) * series.initial_cash))
        values[series.key] = series_values
    return values


def empty_comparison(
    *,
    workspace: Workspace,
    opening_session: date | None,
    primary_benchmark_ticker: str,
    benchmark_tickers: list[str],
    benchmark_items: list[WorkspaceComparisonBenchmarkSeries],
) -> WorkspaceComparison:
    start_date = opening_session or workspace.start_date
    return WorkspaceComparison(
        workspace_id=workspace.id,
        primary_benchmark_ticker=primary_benchmark_ticker,
        benchmark_tickers=benchmark_tickers,
        benchmark_series=benchmark_items,
        start_date=start_date,
        end_date=start_date,
        points=[],
    )


def decimal_key(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def format_currency_label(value: Decimal) -> str:
    amount = float(value)
    if amount.is_integer():
        return f"${int(amount):,}"
    return f"${amount:,.2f}"
