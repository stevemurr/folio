from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import AppSettings, AppSettingsUpdate, BootstrapConfig
from backend.scheduler import reload_scheduler
from backend.services.app_config_service import AppConfigService, get_runtime_settings

router = APIRouter(tags=["app"])


def _serialize_settings(settings) -> AppSettings:
    return AppSettings(
        database={
            "engine": settings.database.engine,
            "path": settings.database.path,
        },
        market={
            "risk_free_rate": settings.market.risk_free_rate,
            "benchmark_ticker": settings.market.benchmark_ticker.upper(),
            "cache_ttl_days": settings.market.cache_ttl_days,
        },
        agent={
            "endpoint": settings.agent.endpoint,
            "model": settings.agent.model,
            "api_key": settings.agent.api_key,
            "max_tokens": settings.agent.max_tokens,
            "temperature": settings.agent.temperature,
        },
        scheduler={
            "enabled": settings.scheduler.enabled,
            "price_refresh_cron": settings.scheduler.price_refresh_cron,
            "zillow_refresh_cron": settings.scheduler.zillow_refresh_cron,
        },
        real_estate={
            "enabled": settings.real_estate.enabled,
            "metro_csv_url": settings.real_estate.metro_csv_url,
            "zip_csv_url": settings.real_estate.zip_csv_url,
            "cache_ttl_days": settings.real_estate.cache_ttl_days,
            "search_limit": settings.real_estate.search_limit,
        },
        capabilities=settings.capabilities.model_dump(),
    )


def _flatten_updates(payload: AppSettingsUpdate) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for section_name in ("market", "agent", "scheduler", "real_estate"):
        section = getattr(payload, section_name)
        if section is None:
            continue
        for key, value in section.model_dump(exclude_none=True).items():
            normalized = value
            if isinstance(normalized, str):
                normalized = normalized.strip()
            if section_name == "market" and key == "benchmark_ticker" and isinstance(normalized, str):
                normalized = normalized.upper()
            updates[f"{section_name}.{key}"] = normalized
    return updates


@router.get("/app/bootstrap", response_model=BootstrapConfig)
def get_bootstrap(db: Session = Depends(get_db)) -> BootstrapConfig:
    settings = get_runtime_settings(db)
    return BootstrapConfig(
        risk_free_rate=settings.market.risk_free_rate,
        benchmark_ticker=settings.market.benchmark_ticker.upper(),
        capabilities=settings.capabilities.model_dump(),
    )


@router.get("/app/settings", response_model=AppSettings)
def get_app_settings(db: Session = Depends(get_db)) -> AppSettings:
    return _serialize_settings(get_runtime_settings(db))


@router.patch("/app/settings", response_model=AppSettings)
def update_app_settings(
    payload: AppSettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> AppSettings:
    settings = AppConfigService(db).update(_flatten_updates(payload))
    reload_scheduler(request.app)
    return _serialize_settings(settings)
