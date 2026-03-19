from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class DatabaseSettings(BaseModel):
    engine: str = "sqlite"
    path: str = "~/.folio/folio.db"


class AgentSettings(BaseModel):
    endpoint: str = ""
    model: str = "llama3.2"
    api_key: str = "none"
    max_tokens: int = 2048
    temperature: float = 0.3


class MarketSettings(BaseModel):
    risk_free_rate: float = 4.25
    benchmark_ticker: str = "SPY"
    cache_ttl_days: int = 1


class SchedulerSettings(BaseModel):
    price_refresh_cron: str = "0 18 * * 1-5"
    enabled: bool = True


class ServerSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8080


class Capabilities(BaseModel):
    agent: bool
    real_estate: bool = False


class Settings(BaseModel):
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    agent: AgentSettings = Field(default_factory=AgentSettings)
    market: MarketSettings = Field(default_factory=MarketSettings)
    scheduler: SchedulerSettings = Field(default_factory=SchedulerSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)

    @property
    def resolved_db_path(self) -> Path:
        return Path(self.database.path).expanduser()

    @property
    def capabilities(self) -> Capabilities:
        return Capabilities(agent=bool(self.agent.endpoint.strip()), real_estate=False)


def get_config_path() -> Path:
    return Path(os.environ.get("FOLIO_CONFIG", "~/.folio/config.yaml")).expanduser()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    config_path = get_config_path()
    payload: dict[str, object] = {}
    if config_path.exists():
        payload = yaml.safe_load(config_path.read_text()) or {}
    settings = Settings.model_validate(payload)
    if settings.database.engine != "sqlite":
        raise RuntimeError("Folio MVP only supports database.engine=sqlite.")
    return settings

