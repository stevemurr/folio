from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    initial_cash: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("10000"))

    benchmarks: Mapped[list["WorkspaceBenchmark"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="WorkspaceBenchmark.created_at",
    )
    collections: Mapped[list["BookCollection"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="BookCollection.created_at",
    )
    portfolios: Mapped[list["Portfolio"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="Portfolio.created_at",
    )


class WorkspaceBenchmark(Base):
    __tablename__ = "workspace_benchmarks"
    __table_args__ = (UniqueConstraint("workspace_id", "ticker", name="uq_workspace_benchmark_ticker"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    ticker: Mapped[str] = mapped_column(String(32), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    workspace: Mapped[Workspace] = relationship(back_populates="benchmarks")


class BookCollection(Base):
    __tablename__ = "book_collections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    initial_cash: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("10000"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    workspace: Mapped[Workspace] = relationship(back_populates="collections")
    portfolios: Mapped[list["Portfolio"]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="Portfolio.created_at",
    )


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    collection_id: Mapped[str | None] = mapped_column(ForeignKey("book_collections.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    base_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    initial_cash: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    strategy_kind: Mapped[str] = mapped_column(String(16), default="custom", nullable=False)
    preset_id: Mapped[str | None] = mapped_column(String(64))

    allocations: Mapped[list["BookAllocation"]] = relationship(
        back_populates="portfolio",
        cascade="all, delete-orphan",
        order_by="BookAllocation.sort_order",
    )
    positions: Mapped[list["Position"]] = relationship(
        back_populates="portfolio",
        cascade="all, delete-orphan",
        order_by="Position.entry_date",
    )
    workspace: Mapped[Workspace] = relationship(back_populates="portfolios")
    collection: Mapped[BookCollection | None] = relationship(back_populates="portfolios")


class BookAllocation(Base):
    __tablename__ = "book_allocations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False)
    ticker: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(9, 4), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    portfolio: Mapped[Portfolio] = relationship(back_populates="allocations")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False)
    ticker: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    shares: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    exit_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_utc,
        onupdate=now_utc,
    )

    portfolio: Mapped[Portfolio] = relationship(back_populates="positions")


class PriceCache(Base):
    __tablename__ = "price_cache"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    open_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    high_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    low_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    close: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    volume: Mapped[int | None] = mapped_column()
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)

    __table_args__ = (Index("ix_price_cache_ticker_date", "ticker", "date"),)


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AppConfig(Base):
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class RealEstateMarket(Base):
    __tablename__ = "real_estate_markets"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    region_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    region_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    metro: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    revision: Mapped[str] = mapped_column(String(32), primary_key=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
