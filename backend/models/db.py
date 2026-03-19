from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    base_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    initial_cash: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    positions: Mapped[list["Position"]] = relationship(
        back_populates="portfolio",
        cascade="all, delete-orphan",
        order_by="Position.entry_date",
    )


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

