from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.models.db import AppConfig


SUPPORTED_APP_CONFIG_TYPES: dict[str, type[Any]] = {
    "market.risk_free_rate": float,
    "market.benchmark_ticker": str,
    "market.cache_ttl_days": int,
    "agent.endpoint": str,
    "agent.model": str,
    "agent.api_key": str,
    "agent.max_tokens": int,
    "agent.temperature": float,
    "scheduler.enabled": bool,
    "scheduler.price_refresh_cron": str,
    "scheduler.zillow_refresh_cron": str,
    "real_estate.enabled": bool,
    "real_estate.metro_csv_url": str,
    "real_estate.zip_csv_url": str,
    "real_estate.cache_ttl_days": int,
    "real_estate.search_limit": int,
}


def get_runtime_settings(session: Session | None = None) -> Settings:
    settings = get_settings()
    if session is None:
        return settings
    return AppConfigService(session).build_runtime_settings(settings)


class AppConfigService:
    def __init__(self, session: Session):
        self.session = session

    def list_overrides(self) -> dict[str, Any]:
        rows = self.session.execute(select(AppConfig).order_by(AppConfig.key.asc())).scalars().all()
        overrides: dict[str, Any] = {}
        for row in rows:
            expected_type = SUPPORTED_APP_CONFIG_TYPES.get(row.key)
            if expected_type is None:
                continue
            overrides[row.key] = self._coerce_value(row.key, json.loads(row.value))
        return overrides

    def build_runtime_settings(self, base_settings: Settings | None = None) -> Settings:
        settings = base_settings or get_settings()
        payload = settings.model_dump()
        for dotted_key, value in self.list_overrides().items():
            self._set_nested_value(payload, dotted_key, value)
        return Settings.model_validate(payload)

    def update(self, updates: Mapping[str, Any]) -> Settings:
        for dotted_key, value in updates.items():
            if dotted_key not in SUPPORTED_APP_CONFIG_TYPES:
                continue
            self.session.merge(AppConfig(key=dotted_key, value=json.dumps(value)))
        self.session.commit()
        return self.build_runtime_settings()

    def _coerce_value(self, dotted_key: str, raw_value: Any) -> Any:
        expected_type = SUPPORTED_APP_CONFIG_TYPES[dotted_key]
        if expected_type is bool:
            return bool(raw_value)
        if expected_type is int:
            return int(raw_value)
        if expected_type is float:
            return float(raw_value)
        return str(raw_value)

    @staticmethod
    def _set_nested_value(payload: dict[str, Any], dotted_key: str, value: Any) -> None:
        path = dotted_key.split(".")
        target = payload
        for key in path[:-1]:
            target = target.setdefault(key, {})
        target[path[-1]] = value
