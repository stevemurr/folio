from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd
import pytest
import yaml
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.database import get_engine, get_session_factory, init_database
from backend.main import app
from backend.models.db import Base, Portfolio, PriceCache


@pytest.fixture()
def test_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    config_path = tmp_path / "config.yaml"
    db_path = tmp_path / "folio.db"
    config_path.write_text(
        yaml.safe_dump(
            {
                "database": {"engine": "sqlite", "path": str(db_path)},
                "agent": {"endpoint": ""},
                "market": {"risk_free_rate": 4.25, "benchmark_ticker": "SPY", "cache_ttl_days": 30},
                "scheduler": {
                    "enabled": False,
                    "price_refresh_cron": "0 18 * * 1-5",
                    "zillow_refresh_cron": "0 9 1 * *",
                },
                "real_estate": {"enabled": False, "metro_csv_url": "", "zip_csv_url": ""},
                "server": {"host": "0.0.0.0", "port": 8080},
            }
        )
    )
    monkeypatch.setenv("FOLIO_CONFIG", str(config_path))
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
    init_database()
    yield {"db_path": db_path, "config_path": config_path, "tmp_path": tmp_path}
    Base.metadata.drop_all(bind=get_engine())
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


@pytest.fixture()
def db_session(test_env):  # noqa: ARG001
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(test_env):  # noqa: ARG001
    with TestClient(app) as test_client:
        yield test_client


def add_price_history(session, ticker: str, closes: list[tuple[date, float]]) -> None:
    for current_date, close in closes:
        session.merge(
            PriceCache(
                ticker=ticker,
                date=current_date,
                source="yfinance",
                open_price=close,
                high_price=close,
                low_price=close,
                close=close,
                volume=1_000_000,
                fetched_at=datetime.now(UTC),
            )
        )
    session.commit()


def business_series(start: str, periods: int, base: float, step: float) -> list[tuple[date, float]]:
    dates = pd.bdate_range(start=start, periods=periods)
    return [(timestamp.date(), base + (index * step)) for index, timestamp in enumerate(dates)]


def recent_business_series(periods: int, base: float, step: float) -> list[tuple[date, float]]:
    dates = pd.bdate_range(end=date.today(), periods=periods)
    return [(timestamp.date(), base + (index * step)) for index, timestamp in enumerate(dates)]


def create_portfolio(session, *, name: str = "Core", initial_cash: float = 10_000) -> Portfolio:
    portfolio = Portfolio(name=name, description="", initial_cash=initial_cash)
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)
    return portfolio
