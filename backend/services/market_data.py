from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pandas as pd
import yfinance as yf
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import PriceCache
from backend.models.schemas import MarketSearchResult, MarketPriceResponse, PricePoint
from backend.services.app_config_service import get_runtime_settings
from backend.services.real_estate_data import RealEstateDataService


FETCH_BUFFER_DAYS = 7


@dataclass
class ResolvedPrice:
    ticker: str
    date: date
    close: Decimal


class MarketDataService:
    def __init__(self, session: Session):
        self.session = session
        self.settings = get_runtime_settings(session)
        self.real_estate = RealEstateDataService(session)

    def refresh_recent_prices(self, tickers: list[str]) -> None:
        end_date = date.today()
        start_date = end_date - timedelta(days=30)
        self.ensure_price_history(tickers, start_date, end_date, force=True)

    def ensure_price_history(
        self,
        tickers: list[str],
        start_date: date,
        end_date: date,
        *,
        force: bool = False,
    ) -> None:
        normalized = sorted({self._normalize_ticker(ticker) for ticker in tickers if ticker})
        if not normalized:
            return

        real_estate_tickers = [ticker for ticker in normalized if ticker.startswith("RE:")]
        market_tickers = [ticker for ticker in normalized if not ticker.startswith("RE:")]

        for ticker in real_estate_tickers:
            self.real_estate.ensure_price_history(ticker, start_date, end_date, force=force)

        if not market_tickers:
            return

        stale_before = datetime.now(UTC).replace(tzinfo=None) - timedelta(
            days=self.settings.market.cache_ttl_days
        )
        needs_fetch: list[str] = []
        for ticker in market_tickers:
            cache_min, cache_max, fetched_at = self.session.execute(
                select(
                    func.min(PriceCache.date),
                    func.max(PriceCache.date),
                    func.max(PriceCache.fetched_at),
                ).where(PriceCache.ticker == ticker)
            ).one()
            if force or cache_min is None or cache_min > start_date or cache_max < end_date:
                needs_fetch.append(ticker)
                continue
            normalized_fetched_at = fetched_at
            if normalized_fetched_at is not None and normalized_fetched_at.tzinfo is not None:
                normalized_fetched_at = normalized_fetched_at.astimezone(UTC).replace(tzinfo=None)
            if normalized_fetched_at is None or normalized_fetched_at < stale_before:
                needs_fetch.append(ticker)

        if needs_fetch:
            self._fetch_history_batch(
                needs_fetch,
                start_date - timedelta(days=FETCH_BUFFER_DAYS),
                end_date,
            )

    def search_tickers(self, query: str) -> list[MarketSearchResult]:
        if not query.strip():
            return []

        results: list[MarketSearchResult] = []
        search_cls = getattr(yf, "Search", None)
        if search_cls is not None:
            try:
                search = search_cls(query, max_results=10)
                for quote in getattr(search, "quotes", []) or []:
                    symbol = quote.get("symbol")
                    quote_type = (quote.get("quoteType") or "").lower()
                    if not symbol or quote_type not in {"equity", "etf"}:
                        continue
                    results.append(
                        MarketSearchResult(
                            ticker=symbol.upper(),
                            name=quote.get("shortname") or quote.get("longname") or symbol.upper(),
                            asset_type="etf" if quote_type == "etf" else "stock",
                            exchange=quote.get("exchange"),
                        )
                    )
            except Exception:
                results = []

        if results:
            return results[:10]

        candidate = self._normalize_ticker(query)
        try:
            resolved = self.resolve_price_on_or_before(candidate, date.today())
        except ApiErrorException:
            return []
        return [
            MarketSearchResult(
                ticker=candidate,
                name=f"{candidate} ({resolved.date.isoformat()})",
                asset_type="stock",
                exchange=None,
            )
        ]

    def resolve_price_on_or_before(self, ticker: str, target_date: date) -> ResolvedPrice:
        normalized = self._normalize_ticker(ticker)
        self.ensure_price_history(
            [normalized],
            target_date - timedelta(days=FETCH_BUFFER_DAYS),
            max(target_date, date.today()),
        )
        row = self.session.execute(
            select(PriceCache)
            .where(PriceCache.ticker == normalized, PriceCache.date <= target_date)
            .order_by(PriceCache.date.desc())
        ).scalars().first()
        if row is None:
            raise ApiErrorException(404, "invalid_ticker", f"No market data found for {normalized}.")
        return ResolvedPrice(ticker=normalized, date=row.date, close=row.close)

    def get_latest_price(self, ticker: str) -> MarketPriceResponse:
        normalized = self._normalize_ticker(ticker)
        self.ensure_price_history([normalized], date.today() - timedelta(days=30), date.today())
        rows = self.session.execute(
            select(PriceCache)
            .where(PriceCache.ticker == normalized)
            .order_by(PriceCache.date.desc())
            .limit(2)
        ).scalars().all()
        if not rows:
            raise ApiErrorException(404, "invalid_ticker", f"No market data found for {normalized}.")
        latest = rows[0]
        previous = rows[1] if len(rows) > 1 else None
        change = None if previous is None else float(latest.close - previous.close)
        change_percent = None
        if previous is not None and previous.close:
            change_percent = float((latest.close - previous.close) / previous.close)
        return MarketPriceResponse(
            ticker=normalized,
            price=float(latest.close),
            previous_close=float(previous.close) if previous else None,
            change=change,
            change_percent=change_percent,
            as_of=latest.date,
        )

    def get_history(self, ticker: str, start_date: date, end_date: date) -> list[PricePoint]:
        normalized = self._normalize_ticker(ticker)
        self.ensure_price_history([normalized], start_date, end_date)
        rows = self.session.execute(
            select(PriceCache)
            .where(PriceCache.ticker == normalized, PriceCache.date >= start_date, PriceCache.date <= end_date)
            .order_by(PriceCache.date.asc())
        ).scalars().all()
        if not rows:
            raise ApiErrorException(404, "invalid_ticker", f"No market data found for {normalized}.")
        return [
            PricePoint(
                date=row.date,
                open=float(row.open_price) if row.open_price is not None else None,
                high=float(row.high_price) if row.high_price is not None else None,
                low=float(row.low_price) if row.low_price is not None else None,
                close=float(row.close),
                volume=row.volume,
            )
            for row in rows
        ]

    def load_price_frame(self, tickers: list[str], start_date: date, end_date: date) -> pd.DataFrame:
        normalized = sorted({self._normalize_ticker(ticker) for ticker in tickers if ticker})
        if not normalized:
            return pd.DataFrame()
        self.ensure_price_history(normalized, start_date, end_date)
        rows = self.session.execute(
            select(PriceCache)
            .where(PriceCache.ticker.in_(normalized), PriceCache.date >= start_date, PriceCache.date <= end_date)
            .order_by(PriceCache.date.asc())
        ).scalars().all()
        if not rows:
            return pd.DataFrame()
        payload = [
            {"date": row.date, "ticker": row.ticker, "close": float(row.close)}
            for row in rows
        ]
        frame = pd.DataFrame(payload)
        pivot = frame.pivot(index="date", columns="ticker", values="close").sort_index()
        pivot.index = pd.to_datetime(pivot.index)
        return pivot

    def _fetch_history_batch(self, tickers: list[str], start_date: date, end_date: date) -> None:
        data = yf.download(
            tickers=tickers if len(tickers) > 1 else tickers[0],
            start=start_date.isoformat(),
            end=(end_date + timedelta(days=1)).isoformat(),
            auto_adjust=False,
            actions=False,
            group_by="ticker",
            progress=False,
            threads=False,
        )
        fetched_at = datetime.now(UTC).replace(tzinfo=None)
        missing: list[str] = []

        for ticker in tickers:
            frame = self._extract_ticker_frame(data, ticker, multi=len(tickers) > 1)
            if frame.empty:
                missing.append(ticker)
                continue
            for raw_date, row in frame.iterrows():
                close_value = row.get("Adj Close") if pd.notna(row.get("Adj Close")) else row.get("Close")
                if pd.isna(close_value):
                    continue
                cache_row = PriceCache(
                    ticker=ticker,
                    date=raw_date.date(),
                    source="yfinance",
                    open_price=self._decimal_or_none(row.get("Open")),
                    high_price=self._decimal_or_none(row.get("High")),
                    low_price=self._decimal_or_none(row.get("Low")),
                    close=Decimal(str(round(float(close_value), 6))),
                    volume=int(row.get("Volume")) if pd.notna(row.get("Volume")) else None,
                    fetched_at=fetched_at,
                )
                self.session.merge(cache_row)

        if missing:
            self.session.rollback()
            ticker_list = ", ".join(missing)
            raise ApiErrorException(404, "invalid_ticker", f"No market data found for {ticker_list}.")

        self.session.commit()

    def _extract_ticker_frame(self, data: pd.DataFrame, ticker: str, *, multi: bool) -> pd.DataFrame:
        if data.empty:
            return pd.DataFrame()
        if multi:
            if ticker not in data.columns.get_level_values(0):
                return pd.DataFrame()
            frame = data[ticker].copy()
        else:
            frame = data.copy()
        if isinstance(frame.columns, pd.MultiIndex):
            frame.columns = frame.columns.get_level_values(-1)
        return frame.dropna(how="all")

    def _normalize_ticker(self, ticker: str) -> str:
        normalized = ticker.strip().upper()
        if normalized.startswith("RE:"):
            if not self.settings.capabilities.real_estate:
                raise ApiErrorException(501, "capability_disabled", "Real estate support is disabled.")
            return normalized
        return normalized

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value is None or pd.isna(value):
            return None
        return Decimal(str(round(float(value), 6)))
