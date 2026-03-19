from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest

from backend.errors import ApiErrorException
from backend.models.db import PriceCache
from backend.services.market_data import MarketDataService

from .conftest import add_price_history


def test_market_data_uses_cache_without_refetch(db_session, monkeypatch: pytest.MonkeyPatch):
    add_price_history(
        db_session,
        "AAPL",
        [
            (date(2024, 1, 2), 100.0),
            (date(2024, 1, 3), 101.0),
            (date(2024, 1, 4), 102.0),
        ],
    )

    def fail_fetch(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("fetch should not run")

    monkeypatch.setattr(MarketDataService, "_fetch_history_batch", fail_fetch)
    history = MarketDataService(db_session).get_history("AAPL", date(2024, 1, 2), date(2024, 1, 4))

    assert len(history) == 3
    assert history[-1].close == pytest.approx(102.0)


def test_market_data_refreshes_stale_rows(db_session, monkeypatch: pytest.MonkeyPatch):
    stale_row = PriceCache(
        ticker="AAPL",
        date=date(2024, 1, 2),
        source="yfinance",
        open_price=100,
        high_price=100,
        low_price=100,
        close=100,
        volume=10,
        fetched_at=datetime.now(UTC) - timedelta(days=60),
    )
    db_session.add(stale_row)
    db_session.commit()

    called = {"value": False}

    def fetch(self, tickers, start_date, end_date):  # noqa: ANN001
        called["value"] = True
        add_price_history(
            db_session,
            tickers[0],
            [(date(2024, 1, 2), 100.0), (date(2024, 1, 3), 101.0), (date(2024, 1, 4), 102.0)],
        )

    monkeypatch.setattr(MarketDataService, "_fetch_history_batch", fetch)
    response = MarketDataService(db_session).get_latest_price("AAPL")

    assert called["value"] is True
    assert response.price == pytest.approx(102.0)


def test_market_data_rejects_invalid_ticker(db_session, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(pd, "DataFrame", pd.DataFrame)

    def empty_fetch(*args, **kwargs):  # noqa: ANN002, ANN003
        return pd.DataFrame()

    monkeypatch.setattr("backend.services.market_data.yf.download", empty_fetch)
    with pytest.raises(ApiErrorException) as error:
        MarketDataService(db_session).ensure_price_history(["BAD"], date(2024, 1, 2), date(2024, 1, 5))

    assert error.value.code == "invalid_ticker"

