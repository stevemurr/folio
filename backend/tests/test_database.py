from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from sqlalchemy import inspect, select

from backend.config import get_settings
from backend.database import get_engine, get_session_factory, init_database
from backend.models.db import Base, SchemaMigration


def write_config(config_path: Path, db_path: Path, *, engine: str = "sqlite") -> None:
    config_path.write_text(
        yaml.safe_dump(
            {
                "database": {"engine": engine, "path": str(db_path)},
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


def clear_database_caches() -> None:
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


def test_init_database_runs_revisioned_migrations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    config_path = tmp_path / "config.yaml"
    db_path = tmp_path / "folio.db"
    write_config(config_path, db_path)
    monkeypatch.setenv("FOLIO_CONFIG", str(config_path))
    clear_database_caches()

    assert init_database() == [
        "0001_initial",
        "0002_real_estate_markets",
        "0003_workspace_books",
        "0004_workspace_strategy_model",
    ]
    assert init_database() == []

    engine = get_engine()
    inspector = inspect(engine)
    assert "schema_migrations" in inspector.get_table_names()
    assert "workspaces" in inspector.get_table_names()
    assert "workspace_benchmarks" in inspector.get_table_names()
    assert "portfolios" in inspector.get_table_names()
    assert "book_allocations" in inspector.get_table_names()
    with engine.connect() as connection:
        revisions = list(connection.execute(select(SchemaMigration.revision)).scalars())
    assert revisions == [
        "0001_initial",
        "0002_real_estate_markets",
        "0003_workspace_books",
        "0004_workspace_strategy_model",
    ]

    Base.metadata.drop_all(bind=engine)
    clear_database_caches()


def test_duckdb_config_exposes_duckdb_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    config_path = tmp_path / "config.yaml"
    db_path = tmp_path / "folio.duckdb"
    write_config(config_path, db_path, engine="duckdb")
    monkeypatch.setenv("FOLIO_CONFIG", str(config_path))
    clear_database_caches()

    settings = get_settings()
    assert settings.database.engine == "duckdb"
    assert settings.resolved_db_url == f"duckdb:///{db_path}"

    clear_database_caches()
