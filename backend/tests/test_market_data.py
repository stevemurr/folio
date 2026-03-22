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


def test_resolve_first_prices_handles_duplicate_price_columns(db_session, monkeypatch: pytest.MonkeyPatch):
    index = pd.to_datetime(["2024-01-02", "2024-01-03"])
    columns = pd.MultiIndex.from_tuples(
        [
            ("raw", "Adj Close"),
            ("derived", "Adj Close"),
            ("raw", "Close"),
            ("raw", "Open"),
            ("raw", "High"),
            ("raw", "Low"),
            ("raw", "Volume"),
        ]
    )
    payload = pd.DataFrame(
        [
            [100.0, None, 100.0, 99.0, 101.0, 98.0, 1000],
            [101.0, None, 101.0, 100.0, 102.0, 99.0, 1100],
        ],
        index=index,
        columns=columns,
    )

    monkeypatch.setattr("backend.services.market_data.yf.download", lambda *args, **kwargs: payload)
    resolved = MarketDataService(db_session).resolve_first_prices_on_or_after(["SPY"], date(2024, 1, 2))

    assert resolved["SPY"] is not None
    assert resolved["SPY"].date == date(2024, 1, 2)
    assert resolved["SPY"].close == pytest.approx(100.0)


def test_resolve_prices_on_or_after_batches_lookup(db_session, monkeypatch: pytest.MonkeyPatch):
    add_price_history(
        db_session,
        "AAPL",
        [
            (date(2024, 1, 2), 100.0),
            (date(2024, 1, 3), 101.0),
        ],
    )
    add_price_history(
        db_session,
        "MSFT",
        [
            (date(2024, 1, 2), 200.0),
            (date(2024, 1, 3), 202.0),
        ],
    )

    calls: list[tuple[list[str], date, date]] = []

    def track_history(self, tickers, start_date, end_date, *, force=False):  # noqa: ANN001
        calls.append((tickers, start_date, end_date))

    monkeypatch.setattr(MarketDataService, "ensure_price_history", track_history)
    resolved = MarketDataService(db_session).resolve_prices_on_or_after(["AAPL", "MSFT"], date(2024, 1, 2))

    assert list(resolved) == ["AAPL", "MSFT"]
    assert resolved["AAPL"].close == pytest.approx(100.0)
    assert resolved["MSFT"].close == pytest.approx(200.0)
    assert calls == [(["AAPL", "MSFT"], date(2024, 1, 2), date.today())]


def test_market_search_caches_normalized_queries(db_session, monkeypatch: pytest.MonkeyPatch):
    MarketDataService._search_cache.clear()
    calls = {"count": 0}

    class FakeSearch:
        def __init__(self, query, max_results=10):  # noqa: ANN001
            calls["count"] += 1
            self.quotes = [
                {
                    "symbol": "AAPL",
                    "quoteType": "equity",
                    "shortname": "Apple Inc.",
                    "exchange": "NASDAQ",
                }
            ]

    monkeypatch.setattr("backend.services.market_data.yf.Search", FakeSearch)
    service = MarketDataService(db_session)

    first = service.search_tickers("aapl")
    second = service.search_tickers("AAPL")

    assert calls["count"] == 1
    assert first[0].ticker == "AAPL"
    assert second[0].ticker == "AAPL"
