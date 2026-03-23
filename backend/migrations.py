from __future__ import annotations

import argparse
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sqlalchemy import Connection, Engine, inspect, select

from backend.models.db import (
    Base,
    BookCollection,
    BookAllocation,
    ChatHistory,
    Portfolio,
    Position,
    RealEstateMarket,
    SchemaMigration,
    Simulation,
    SimulationAgent,
    StrategyTemplate,
    Workspace,
    WorkspaceBenchmark,
    now_utc,
)


MigrationFn = Callable[[Connection], None]
MIGRATION_TABLE = SchemaMigration.__table__


@dataclass(frozen=True)
class Migration:
    revision: str
    description: str
    upgrade: MigrationFn


def _upgrade_initial(connection: Connection) -> None:
    Base.metadata.create_all(bind=connection)


def _upgrade_real_estate_markets(connection: Connection) -> None:
    RealEstateMarket.__table__.create(bind=connection, checkfirst=True)


def _upgrade_workspace_books(connection: Connection) -> None:
    ChatHistory.__table__.drop(bind=connection, checkfirst=True)
    Position.__table__.drop(bind=connection, checkfirst=True)
    Portfolio.__table__.drop(bind=connection, checkfirst=True)
    Workspace.__table__.drop(bind=connection, checkfirst=True)

    Workspace.__table__.create(bind=connection, checkfirst=True)
    Portfolio.__table__.create(bind=connection, checkfirst=True)
    Position.__table__.create(bind=connection, checkfirst=True)
    ChatHistory.__table__.create(bind=connection, checkfirst=True)


def _upgrade_workspace_strategy_model(connection: Connection) -> None:
    ChatHistory.__table__.drop(bind=connection, checkfirst=True)
    Position.__table__.drop(bind=connection, checkfirst=True)
    BookAllocation.__table__.drop(bind=connection, checkfirst=True)
    Portfolio.__table__.drop(bind=connection, checkfirst=True)
    WorkspaceBenchmark.__table__.drop(bind=connection, checkfirst=True)
    Workspace.__table__.drop(bind=connection, checkfirst=True)

    Workspace.__table__.create(bind=connection, checkfirst=True)
    WorkspaceBenchmark.__table__.create(bind=connection, checkfirst=True)
    Portfolio.__table__.create(bind=connection, checkfirst=True)
    BookAllocation.__table__.create(bind=connection, checkfirst=True)
    Position.__table__.create(bind=connection, checkfirst=True)
    ChatHistory.__table__.create(bind=connection, checkfirst=True)


def _upgrade_collections_first_workspace_flow(connection: Connection) -> None:
    BookCollection.__table__.create(bind=connection, checkfirst=True)

    inspector = inspect(connection)
    portfolio_columns = {column["name"] for column in inspector.get_columns("portfolios")}
    if "collection_id" not in portfolio_columns:
        connection.exec_driver_sql("ALTER TABLE portfolios ADD COLUMN collection_id VARCHAR")
    connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_portfolios_collection_id ON portfolios (collection_id)")

    workspace_rows = connection.execute(
        select(Workspace.id, Workspace.initial_cash).select_from(Workspace.__table__)
    ).all()
    for workspace_id, initial_cash in workspace_rows:
        existing_collection_id = connection.execute(
            select(BookCollection.id)
            .where(BookCollection.workspace_id == workspace_id)
            .order_by(BookCollection.created_at.asc())
        ).scalar_one_or_none()
        if existing_collection_id is None:
            existing_collection_id = str(uuid.uuid4())
            connection.execute(
                BookCollection.__table__.insert().values(
                    id=existing_collection_id,
                    workspace_id=workspace_id,
                    name="Collection 1",
                    initial_cash=initial_cash,
                    created_at=now_utc(),
                )
            )

        connection.execute(
            Portfolio.__table__.update()
            .where(Portfolio.workspace_id == workspace_id)
            .where(Portfolio.collection_id.is_(None))
            .values(collection_id=existing_collection_id)
        )


def _upgrade_simulations(connection: Connection) -> None:
    StrategyTemplate.__table__.create(bind=connection, checkfirst=True)
    Simulation.__table__.create(bind=connection, checkfirst=True)
    SimulationAgent.__table__.create(bind=connection, checkfirst=True)


MIGRATIONS: tuple[Migration, ...] = (
    Migration("0001_initial", "Create Folio core tables.", _upgrade_initial),
    Migration("0002_real_estate_markets", "Create Zillow real-estate catalog table.", _upgrade_real_estate_markets),
    Migration(
        "0003_workspace_books",
        "Reset saved state for the workspace and book comparison model.",
        _upgrade_workspace_books,
    ),
    Migration(
        "0004_workspace_strategy_model",
        "Reset saved state for workspace bankroll, benchmark overlays, and editable book strategies.",
        _upgrade_workspace_strategy_model,
    ),
    Migration(
        "0005_collections_first_workspace_flow",
        "Add book collections and backfill one collection per workspace.",
        _upgrade_collections_first_workspace_flow,
    ),
    Migration(
        "0006_simulations",
        "Add strategy templates, simulations, and simulation agents tables.",
        _upgrade_simulations,
    ),
)


def ensure_migration_table(connection: Connection) -> None:
    MIGRATION_TABLE.create(bind=connection, checkfirst=True)


def list_applied_revisions(connection: Connection) -> list[str]:
    ensure_migration_table(connection)
    return list(connection.execute(select(MIGRATION_TABLE.c.revision)).scalars())


def pending_revisions(engine: Engine) -> list[str]:
    with engine.connect() as connection:
        applied = set(list_applied_revisions(connection))
    return [migration.revision for migration in MIGRATIONS if migration.revision not in applied]


def run_migrations(engine: Engine) -> list[str]:
    applied_now: list[str] = []
    with engine.begin() as connection:
        applied = set(list_applied_revisions(connection))
        for migration in MIGRATIONS:
            if migration.revision in applied:
                continue
            migration.upgrade(connection)
            connection.execute(
                MIGRATION_TABLE.insert().values(
                    revision=migration.revision,
                    description=migration.description,
                    applied_at=now_utc(),
                )
            )
            applied.add(migration.revision)
            applied_now.append(migration.revision)
    return applied_now


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        ensure_migration_table(connection)
        return connection.execute(
            select(MIGRATION_TABLE.c.revision).order_by(
                MIGRATION_TABLE.c.applied_at.desc(),
                MIGRATION_TABLE.c.revision.desc(),
            )
        ).scalars().first()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Folio database migrations.")
    parser.add_argument("command", choices=["upgrade", "status"], nargs="?", default="upgrade")
    args = parser.parse_args(argv)

    from backend.database import get_engine

    engine = get_engine()
    if args.command == "status":
        current = current_revision(engine)
        pending = pending_revisions(engine)
        print(f"current_revision={current or 'none'}")
        print(f"pending={','.join(pending) if pending else 'none'}")
        return 0

    applied = run_migrations(engine)
    if applied:
        print(f"applied={','.join(applied)}")
    else:
        print("applied=none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
