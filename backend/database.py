from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.exc import NoSuchModuleError
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_settings
from backend.migrations import run_migrations


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    db_path = settings.resolved_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connect_args: dict[str, object] = {}
    if settings.database.engine == "sqlite":
        connect_args["check_same_thread"] = False

    try:
        engine = create_engine(settings.resolved_db_url, connect_args=connect_args, future=True)
    except NoSuchModuleError as exc:
        if settings.database.engine == "duckdb":
            raise RuntimeError(
                "DuckDB support requires installing the optional `duckdb` and `duckdb-engine` packages."
            ) from exc
        raise

    if settings.database.engine == "sqlite":
        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, future=True)


def init_database() -> list[str]:
    return run_migrations(get_engine())


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
