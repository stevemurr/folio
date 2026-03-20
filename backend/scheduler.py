from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from sqlalchemy.orm import Session

from backend.database import get_session_factory
from backend.models.db import Position
from backend.services.app_config_service import get_runtime_settings
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


def _refresh_tracked_real_estate() -> None:
    session_factory = get_session_factory()
    session: Session = session_factory()
    try:
        tickers = sorted(
            {
                position.ticker
                for position in session.query(Position).filter(Position.asset_type == "real_estate")
            }
        )
        if not tickers:
            return
        market_service = MarketDataService(session)
        market_service.refresh_recent_prices(tickers)
    finally:
        session.close()


def _cron_trigger(cron_expr: str) -> CronTrigger:
    minute, hour, day, month, day_of_week = cron_expr.split()
    return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week)


def create_scheduler() -> BackgroundScheduler:
    session_factory = get_session_factory()
    with session_factory() as session:
        settings = get_runtime_settings(session)
    scheduler = BackgroundScheduler()
    if settings.scheduler.enabled:
        scheduler.add_job(
            _refresh_tracked_tickers,
            _cron_trigger(settings.scheduler.price_refresh_cron),
            id="price_refresh",
            replace_existing=True,
        )
        if settings.capabilities.real_estate:
            scheduler.add_job(
                _refresh_tracked_real_estate,
                _cron_trigger(settings.scheduler.zillow_refresh_cron),
                id="zillow_refresh",
                replace_existing=True,
            )
    return scheduler


def reload_scheduler(app: FastAPI) -> None:
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler is not None:
        scheduler.shutdown(wait=False)
    next_scheduler = create_scheduler()
    app.state.scheduler = next_scheduler
    next_scheduler.start()
