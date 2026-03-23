from __future__ import annotations

from pathlib import Path
from datetime import date

import pytest
import yaml
from sqlalchemy import inspect, select

from backend.config import get_settings
from backend.database import get_engine, get_session_factory, init_database
from backend.migrations import MIGRATIONS, MIGRATION_TABLE, ensure_migration_table, run_migrations
from backend.models.db import Base, BookCollection, Portfolio, SchemaMigration, Workspace, now_utc


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
        "0005_collections_first_workspace_flow",
        "0006_simulations",
    ]
    assert init_database() == []

    engine = get_engine()
    inspector = inspect(engine)
    assert "schema_migrations" in inspector.get_table_names()
    assert "workspaces" in inspector.get_table_names()
    assert "workspace_benchmarks" in inspector.get_table_names()
    assert "book_collections" in inspector.get_table_names()
    assert "portfolios" in inspector.get_table_names()
    assert "book_allocations" in inspector.get_table_names()
    with engine.connect() as connection:
        revisions = list(connection.execute(select(SchemaMigration.revision)).scalars())
    assert revisions == [
        "0001_initial",
        "0002_real_estate_markets",
        "0003_workspace_books",
        "0004_workspace_strategy_model",
        "0005_collections_first_workspace_flow",
        "0006_simulations",
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


def test_collections_migration_backfills_existing_workspace_books(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    config_path = tmp_path / "config.yaml"
    db_path = tmp_path / "folio.db"
    write_config(config_path, db_path)
    monkeypatch.setenv("FOLIO_CONFIG", str(config_path))
    clear_database_caches()

    engine = get_engine()
    with engine.begin() as connection:
        ensure_migration_table(connection)
        for migration in MIGRATIONS:
            if migration.revision == "0005_collections_first_workspace_flow":
                break
            migration.upgrade(connection)
            connection.execute(
                MIGRATION_TABLE.insert().values(
                    revision=migration.revision,
                    description=migration.description,
                    applied_at=now_utc(),
                )
            )

        workspace_id = "workspace-1"
        connection.execute(
            Workspace.__table__.insert().values(
                id=workspace_id,
                name="March 23, 2020",
                start_date=date(2020, 3, 23),
                created_at=now_utc(),
                initial_cash=10000,
            )
        )
        connection.execute(
            Portfolio.__table__.insert().values(
                id="book-1",
                workspace_id=workspace_id,
                name="Core",
                description="",
                created_at=now_utc(),
                base_currency="USD",
                initial_cash=10000,
                strategy_kind="preset",
                preset_id="core",
            )
        )

    assert run_migrations(engine) == ["0005_collections_first_workspace_flow", "0006_simulations"]

    session = get_session_factory()()
    try:
        collection = session.execute(select(BookCollection)).scalar_one()
        portfolio = session.execute(select(Portfolio)).scalar_one()
        assert collection.workspace_id == workspace_id
        assert collection.name == "Collection 1"
        assert float(collection.initial_cash) == 10000
        assert portfolio.collection_id == collection.id
    finally:
        session.close()

    Base.metadata.drop_all(bind=engine)
    clear_database_caches()
