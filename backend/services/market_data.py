from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, ClassVar

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
SEARCH_CACHE_TTL = timedelta(minutes=5)


@dataclass
class ResolvedPrice:
    ticker: str
    date: date
    close: Decimal


class MarketDataService:
    _search_cache: ClassVar[dict[str, tuple[datetime, list[MarketSearchResult]]]] = {}

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
        self._ensure_price_history(tickers, start_date, end_date, force=force, allow_missing=False)

    def ensure_price_history_partial(
        self,
        tickers: list[str],
        start_date: date,
        end_date: date,
        *,
        force: bool = False,
    ) -> list[str]:
        return self._ensure_price_history(tickers, start_date, end_date, force=force, allow_missing=True)

    def _ensure_price_history(
        self,
        tickers: list[str],
        start_date: date,
        end_date: date,
        *,
        force: bool = False,
        allow_missing: bool,
    ) -> list[str]:
        normalized = sorted({self._normalize_ticker(ticker) for ticker in tickers if ticker})
        if not normalized:
            return []
        expected_start, expected_end = self._expected_market_window(start_date, end_date)
        if expected_start is None or expected_end is None:
            return []

        real_estate_tickers = [ticker for ticker in normalized if ticker.startswith("RE:")]
        market_tickers = [ticker for ticker in normalized if not ticker.startswith("RE:")]
        missing: list[str] = []

        for ticker in real_estate_tickers:
            try:
                self.real_estate.ensure_price_history(ticker, start_date, end_date, force=force)
            except ApiErrorException:
                if not allow_missing:
                    raise
                missing.append(ticker)

        if not market_tickers:
            return missing

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
            if force or cache_min is None or cache_min > expected_start or cache_max < expected_end:
                needs_fetch.append(ticker)
                continue
            normalized_fetched_at = fetched_at
            if normalized_fetched_at is not None and normalized_fetched_at.tzinfo is not None:
                normalized_fetched_at = normalized_fetched_at.astimezone(UTC).replace(tzinfo=None)
            if normalized_fetched_at is None or normalized_fetched_at < stale_before:
                needs_fetch.append(ticker)

        if needs_fetch:
            fetch_args = (
                needs_fetch,
                start_date - timedelta(days=FETCH_BUFFER_DAYS),
                end_date,
            )
            if allow_missing:
                missing.extend(self._fetch_history_batch(*fetch_args, allow_missing=True))
            else:
                self._fetch_history_batch(*fetch_args)
        return missing

    def search_tickers(self, query: str) -> list[MarketSearchResult]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        cache_key = normalized_query.lower()
        cached = self._search_cache.get(cache_key)
        now = datetime.now(UTC)
        if cached is not None and cached[0] > now:
            return [item.model_copy(deep=True) for item in cached[1]]

        results: list[MarketSearchResult] = []
        search_cls = getattr(yf, "Search", None)
        if search_cls is not None:
            try:
                search = search_cls(normalized_query, max_results=10)
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
            cached_results = results[:10]
            self._search_cache[cache_key] = (now + SEARCH_CACHE_TTL, cached_results)
            return [item.model_copy(deep=True) for item in cached_results]

        candidate = self._normalize_ticker(normalized_query)
        try:
            resolved = self.resolve_price_on_or_before(candidate, date.today())
        except ApiErrorException:
            self._search_cache[cache_key] = (now + SEARCH_CACHE_TTL, [])
            return []
        fallback = [
            MarketSearchResult(
                ticker=candidate,
                name=f"{candidate} ({resolved.date.isoformat()})",
                asset_type="stock",
                exchange=None,
            )
        ]
        self._search_cache[cache_key] = (now + SEARCH_CACHE_TTL, fallback)
        return [item.model_copy(deep=True) for item in fallback]

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

    def resolve_price_on_or_after(self, ticker: str, target_date: date) -> ResolvedPrice:
        return self.resolve_prices_on_or_after([ticker], target_date)[self._normalize_ticker(ticker)]

    def resolve_prices_on_or_after(self, tickers: list[str], target_date: date) -> dict[str, ResolvedPrice]:
        normalized = sorted({self._normalize_ticker(ticker) for ticker in tickers if ticker})
        if not normalized:
            return {}

        end_date = max(target_date, date.today())
        self.ensure_price_history(normalized, target_date, end_date)
        resolved = self._resolved_prices_from_cache(normalized, target_date)
        missing = [ticker for ticker in normalized if resolved.get(ticker) is None]
        if missing:
            missing_label = ", ".join(missing)
            raise ApiErrorException(
                404,
                "invalid_ticker",
                f"No market data found on or after {target_date.isoformat()} for {missing_label}.",
            )
        return {ticker: price for ticker, price in resolved.items() if price is not None}

    def resolve_first_prices_on_or_after(self, tickers: list[str], target_date: date) -> dict[str, ResolvedPrice | None]:
        normalized = sorted({self._normalize_ticker(ticker) for ticker in tickers if ticker})
        if not normalized:
            return {}

        end_date = max(target_date, date.today())
        self.ensure_price_history_partial(normalized, target_date, end_date)
        return self._resolved_prices_from_cache(normalized, target_date)

    def _resolved_prices_from_cache(
        self,
        normalized: list[str],
        target_date: date,
    ) -> dict[str, ResolvedPrice | None]:
        rows = self.session.execute(
            select(PriceCache)
            .where(PriceCache.ticker.in_(normalized), PriceCache.date >= target_date)
            .order_by(PriceCache.ticker.asc(), PriceCache.date.asc())
        ).scalars().all()

        resolved: dict[str, ResolvedPrice] = {}
        for row in rows:
            if row.ticker in resolved:
                continue
            resolved[row.ticker] = ResolvedPrice(ticker=row.ticker, date=row.date, close=row.close)

        return {ticker: resolved.get(ticker) for ticker in normalized}

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

    def _fetch_history_batch(
        self,
        tickers: list[str],
        start_date: date,
        end_date: date,
        *,
        allow_missing: bool = False,
    ) -> list[str]:
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
                adjusted_close = self._row_value(row, "Adj Close")
                close_value = adjusted_close if pd.notna(adjusted_close) else self._row_value(row, "Close")
                if pd.isna(close_value):
                    continue
                cache_row = PriceCache(
                    ticker=ticker,
                    date=raw_date.date(),
                    source="yfinance",
                    open_price=self._decimal_or_none(self._row_value(row, "Open")),
                    high_price=self._decimal_or_none(self._row_value(row, "High")),
                    low_price=self._decimal_or_none(self._row_value(row, "Low")),
                    close=Decimal(str(round(float(close_value), 6))),
                    volume=self._int_or_none(self._row_value(row, "Volume")),
                    fetched_at=fetched_at,
                )
                self.session.merge(cache_row)

        if missing:
            if allow_missing:
                self.session.commit()
                return missing
            self.session.rollback()
            ticker_list = ", ".join(missing)
            raise ApiErrorException(404, "invalid_ticker", f"No market data found for {ticker_list}.")

        self.session.commit()
        return []

    def _extract_ticker_frame(self, data: pd.DataFrame, ticker: str, *, multi: bool) -> pd.DataFrame:
        if data.empty:
            return pd.DataFrame()
        if multi:
            if not isinstance(data.columns, pd.MultiIndex):
                frame = data.copy()
            else:
                frame = self._select_ticker_columns(data, ticker)
                if frame.empty:
                    return frame
        else:
            frame = data.copy()
        normalized = self._normalize_price_frame(frame)
        return normalized.dropna(how="all")

    def _select_ticker_columns(self, data: pd.DataFrame, ticker: str) -> pd.DataFrame:
        if not isinstance(data.columns, pd.MultiIndex):
            return data.copy()
        for level in range(data.columns.nlevels):
            values = data.columns.get_level_values(level)
            if ticker not in values:
                continue
            return data.xs(ticker, axis=1, level=level, drop_level=True).copy()
        return pd.DataFrame()

    def _normalize_price_frame(self, frame: pd.DataFrame) -> pd.DataFrame:
        if isinstance(frame.columns, pd.MultiIndex):
            price_fields = {"Open", "High", "Low", "Close", "Adj Close", "Volume"}
            target_level: int | None = None
            for level in range(frame.columns.nlevels):
                values = {str(value) for value in frame.columns.get_level_values(level)}
                if price_fields.intersection(values):
                    target_level = level
                    break
            frame = frame.copy()
            frame.columns = frame.columns.get_level_values(target_level if target_level is not None else -1)
        return self._collapse_duplicate_columns(frame)

    def _collapse_duplicate_columns(self, frame: pd.DataFrame) -> pd.DataFrame:
        if not frame.columns.has_duplicates:
            return frame
        collapsed: dict[str, pd.Series] = {}
        for column in dict.fromkeys(str(label) for label in frame.columns):
            duplicate_columns = frame.loc[:, frame.columns == column]
            if isinstance(duplicate_columns, pd.Series):
                collapsed[column] = duplicate_columns
                continue
            collapsed[column] = duplicate_columns.bfill(axis=1).iloc[:, 0]
        return pd.DataFrame(collapsed, index=frame.index)

    def _row_value(self, row: pd.Series, column: str) -> Any:
        value = row.get(column)
        if isinstance(value, pd.Series):
            non_null = value.dropna()
            if non_null.empty:
                return None
            return non_null.iloc[0]
        return value

    def _normalize_ticker(self, ticker: str) -> str:
        normalized = ticker.strip().upper()
        if normalized.startswith("RE:"):
            if not self.settings.capabilities.real_estate:
                raise ApiErrorException(501, "capability_disabled", "Real estate support is disabled.")
            return normalized
        return normalized

    @staticmethod
    def _expected_market_window(start_date: date, end_date: date) -> tuple[date | None, date | None]:
        if start_date > end_date:
            return None, None
        business_days = pd.bdate_range(start=start_date, end=end_date)
        if business_days.empty:
            return None, None
        return business_days[0].date(), business_days[-1].date()

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value is None or pd.isna(value):
            return None
        return Decimal(str(round(float(value), 6)))

    @staticmethod
    def _int_or_none(value: Any) -> int | None:
        if value is None or pd.isna(value):
            return None
        return int(value)
