from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_session_factory
from backend.models.db import Position
from backend.services.market_data import MarketDataService


def _refresh_tracked_tickers() -> None:
    session_factory = get_session_factory()
    session: Session = session_factory()
    try:
        tickers = sorted(
            {
                position.ticker
                for position in session.query(Position).filter(Position.asset_type.in_(["stock", "etf"]))
            }
        )
        if not tickers:
            return
        market_service = MarketDataService(session)
        market_service.refresh_recent_prices(tickers)
    finally:
        session.close()


def create_scheduler() -> BackgroundScheduler:
    settings = get_settings()
    scheduler = BackgroundScheduler()
    if settings.scheduler.enabled:
        minute, hour, _, _, day_of_week = settings.scheduler.price_refresh_cron.split()
        scheduler.add_job(
            _refresh_tracked_tickers,
            CronTrigger(minute=minute, hour=hour, day_of_week=day_of_week),
            id="price_refresh",
            replace_existing=True,
        )
    return scheduler

