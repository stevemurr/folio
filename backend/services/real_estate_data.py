from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import PriceCache, RealEstateMarket
from backend.models.schemas import RealEstateSearchResult
from backend.services.app_config_service import get_runtime_settings


@dataclass(frozen=True)
class ZillowDataset:
    region_type: str
    url: str


class RealEstateDataService:
    def __init__(self, session: Session):
        self.session = session
        self.settings = get_runtime_settings(session)

    def search(self, query: str, *, region_type: str | None = None) -> list[RealEstateSearchResult]:
        if not self.settings.capabilities.real_estate:
            raise ApiErrorException(501, "capability_disabled", "Real estate support is disabled.")
        self.ensure_catalog(region_type=region_type)
        normalized = query.strip().lower()
        statement = select(RealEstateMarket)
        if region_type:
            statement = statement.where(RealEstateMarket.region_type == region_type)
        rows = self.session.execute(statement.order_by(RealEstateMarket.label.asc())).scalars().all()
        matches = []
        for row in rows:
            haystack = " ".join([row.ticker, row.label, row.city, row.state, row.metro]).lower()
            if normalized and normalized not in haystack:
                continue
            matches.append(self._to_search_result(row))
            if len(matches) >= self.settings.real_estate.search_limit:
                break
        return matches

    def list_metros(self, query: str | None = None) -> list[RealEstateSearchResult]:
        return self.search(query or "", region_type="metro")

    def ensure_catalog(self, *, region_type: str | None = None, force: bool = False) -> None:
        dataset_types = [region_type] if region_type else ["metro", "zip"]
        stale_before = datetime.now(UTC) - timedelta(days=self.settings.real_estate.cache_ttl_days)
        for dataset_type in dataset_types:
            current = self.session.execute(
                select(func.max(RealEstateMarket.fetched_at)).where(RealEstateMarket.region_type == dataset_type)
            ).scalar_one_or_none()
            normalized_current = current
            if normalized_current is not None and normalized_current.tzinfo is not None:
                normalized_current = normalized_current.astimezone(UTC).replace(tzinfo=None)
            if not force and normalized_current is not None and normalized_current >= stale_before.replace(tzinfo=None):
                continue
            self._refresh_catalog_dataset(self._dataset(dataset_type))

    def ensure_price_history(self, ticker: str, start_date: date, end_date: date, *, force: bool = False) -> None:
        if not self.settings.capabilities.real_estate:
            raise ApiErrorException(501, "capability_disabled", "Real estate support is disabled.")
        market = self.lookup_market(ticker)
        stale_before = datetime.now(UTC) - timedelta(days=self.settings.real_estate.cache_ttl_days)
        cache_min, cache_max, fetched_at = self.session.execute(
            select(
                func.min(PriceCache.date),
                func.max(PriceCache.date),
                func.max(PriceCache.fetched_at),
            ).where(PriceCache.ticker == market.ticker)
        ).one()
        normalized_fetched_at = fetched_at
        if normalized_fetched_at is not None and normalized_fetched_at.tzinfo is not None:
            normalized_fetched_at = normalized_fetched_at.astimezone(UTC).replace(tzinfo=None)
        if (
            not force
            and cache_min is not None
            and cache_max is not None
            and cache_min <= start_date
            and cache_max >= end_date
            and normalized_fetched_at is not None
            and normalized_fetched_at >= stale_before.replace(tzinfo=None)
        ):
            return
        self._refresh_price_history(market)

    def lookup_market(self, ticker: str) -> RealEstateMarket:
        normalized = ticker.strip().upper()
        market = self.session.get(RealEstateMarket, normalized)
        if market is not None:
            return market
        self.ensure_catalog(force=True)
        market = self.session.get(RealEstateMarket, normalized)
        if market is None:
            raise ApiErrorException(404, "invalid_ticker", f"No real-estate data found for {normalized}.")
        return market

    def _refresh_catalog_dataset(self, dataset: ZillowDataset) -> None:
        frame = self._load_csv(dataset.url)
        fetched_at = datetime.now(UTC).replace(tzinfo=None)
        for _, row in frame.iterrows():
            market = self._catalog_row_to_market(dataset.region_type, row, fetched_at)
            if market is None:
                continue
            self.session.merge(market)
        self.session.commit()

    def _refresh_price_history(self, market: RealEstateMarket) -> None:
        dataset = self._dataset(market.region_type)
        frame = self._load_csv(dataset.url)
        region_row = self._find_region_row(frame, market)
        if region_row is None:
            raise ApiErrorException(404, "invalid_ticker", f"No real-estate price history found for {market.ticker}.")
        fetched_at = datetime.now(UTC).replace(tzinfo=None)
        for column in self._series_columns(frame):
            value = region_row.get(column)
            if pd.isna(value):
                continue
            point_date = pd.to_datetime(column).date()
            close_value = Decimal(str(round(float(value), 6)))
            self.session.merge(
                PriceCache(
                    ticker=market.ticker,
                    date=point_date,
                    source="zillow",
                    open_price=close_value,
                    high_price=close_value,
                    low_price=close_value,
                    close=close_value,
                    volume=None,
                    fetched_at=fetched_at,
                )
            )
        self.session.commit()

    def _find_region_row(self, frame: pd.DataFrame, market: RealEstateMarket) -> pd.Series | None:
        region_ids = frame.get("RegionID")
        if region_ids is None:
            region_ids = frame.get("RegionId")
        if region_ids is not None:
            matches = frame[region_ids.astype(str) == market.region_id]
            if not matches.empty:
                return matches.iloc[0]
        region_names = frame.get("RegionName")
        if region_names is not None:
            for candidate in self._ticker_candidates(frame, market.region_type, region_names.astype(str)):
                matches = frame[candidate == market.ticker]
                if not matches.empty:
                    return matches.iloc[0]
        return None

    def _ticker_candidates(self, frame: pd.DataFrame, region_type: str, names: pd.Series) -> pd.Series:
        if region_type == "zip":
            return names.map(lambda value: f"RE:{self._normalize_zip(value)}")
        region_ids = frame.get("RegionID")
        if region_ids is None:
            region_ids = frame.get("RegionId")
        return region_ids.astype(str).map(lambda value: f"RE:METRO:{value.upper()}")

    def _catalog_row_to_market(
        self,
        region_type: str,
        row: pd.Series,
        fetched_at: datetime,
    ) -> RealEstateMarket | None:
        region_id = self._string_value(row.get("RegionID"))
        if not region_id:
            region_id = self._string_value(row.get("RegionId"))
        region_name = self._string_value(row.get("RegionName"))
        if not region_name:
            return None
        city = self._string_value(row.get("City"))
        state = self._string_value(row.get("StateName"))
        if not state:
            state = self._string_value(row.get("State"))
        metro = self._string_value(row.get("Metro"))
        if region_type == "zip":
            zip_code = self._normalize_zip(region_name)
            ticker = f"RE:{zip_code}"
            label = zip_code
            if city and state:
                label = f"{zip_code} · {city}, {state}"
            elif state:
                label = f"{zip_code} · {state}"
            return RealEstateMarket(
                ticker=ticker,
                region_id=region_id or zip_code,
                region_type=region_type,
                label=label,
                city=city,
                state=state,
                metro=metro,
                fetched_at=fetched_at,
            )

        ticker = f"RE:METRO:{(region_id or region_name).upper()}"
        label = region_name
        if state and state not in label:
            label = f"{label}, {state}"
        return RealEstateMarket(
            ticker=ticker,
            region_id=region_id or region_name,
            region_type=region_type,
            label=label,
            city=city,
            state=state,
            metro=metro or region_name,
            fetched_at=fetched_at,
        )

    @staticmethod
    def _to_search_result(item: RealEstateMarket) -> RealEstateSearchResult:
        return RealEstateSearchResult(
            ticker=item.ticker,
            name=item.label,
            region_type=item.region_type,  # type: ignore[arg-type]
            city=item.city,
            state=item.state,
            metro=item.metro,
        )

    def _dataset(self, region_type: str) -> ZillowDataset:
        if region_type == "metro":
            return ZillowDataset(region_type="metro", url=self.settings.real_estate.metro_csv_url)
        if region_type == "zip":
            return ZillowDataset(region_type="zip", url=self.settings.real_estate.zip_csv_url)
        raise ApiErrorException(400, "invalid_region_type", f"Unsupported region type: {region_type}.")

    def _load_csv(self, source: str) -> pd.DataFrame:
        content: str
        parsed = urlparse(source)
        if parsed.scheme in {"", "file"}:
            path = Path(parsed.path if parsed.scheme == "file" else source).expanduser()
            if not path.exists():
                raise ApiErrorException(502, "zillow_source_missing", f"Configured Zillow source was not found: {path}")
            content = path.read_text()
        else:
            try:
                response = requests.get(source, timeout=30)
                response.raise_for_status()
            except requests.RequestException as exc:
                raise ApiErrorException(
                    502,
                    "zillow_source_unreachable",
                    f"Unable to fetch Zillow data from {source}: {exc}",
                ) from exc
            content = response.text
        try:
            return pd.read_csv(
                io.StringIO(content),
                dtype={"RegionID": str, "RegionId": str, "RegionName": str, "State": str, "StateName": str},
            )
        except Exception as exc:
            raise ApiErrorException(502, "zillow_source_invalid", f"Unable to parse Zillow CSV data: {exc}") from exc

    @staticmethod
    def _series_columns(frame: pd.DataFrame) -> list[str]:
        return [column for column in frame.columns if isinstance(column, str) and len(column) == 10 and column[4] == "-"]

    @staticmethod
    def _normalize_zip(value: str) -> str:
        digits = "".join(char for char in str(value) if char.isdigit())
        if not digits:
            return str(value).strip().upper()
        return digits.zfill(5)

    @staticmethod
    def _string_value(value: object) -> str:
        if value is None or pd.isna(value):
            return ""
        return str(value).strip()
