from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


DEFAULT_ZILLOW_METRO_CSV_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)
DEFAULT_ZILLOW_ZIP_CSV_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)


class DatabaseSettings(BaseModel):
    engine: Literal["sqlite", "duckdb"] = "sqlite"
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
    zillow_refresh_cron: str = "0 9 1 * *"
    enabled: bool = True


class ServerSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8080


class RealEstateSettings(BaseModel):
    enabled: bool = True
    metro_csv_url: str = DEFAULT_ZILLOW_METRO_CSV_URL
    zip_csv_url: str = DEFAULT_ZILLOW_ZIP_CSV_URL
    cache_ttl_days: int = 31
    search_limit: int = 20


class Capabilities(BaseModel):
    agent: bool
    real_estate: bool = False


class Settings(BaseModel):
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    agent: AgentSettings = Field(default_factory=AgentSettings)
    market: MarketSettings = Field(default_factory=MarketSettings)
    scheduler: SchedulerSettings = Field(default_factory=SchedulerSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    real_estate: RealEstateSettings = Field(default_factory=RealEstateSettings)

    @property
    def resolved_db_path(self) -> Path:
        return Path(self.database.path).expanduser()

    @property
    def resolved_db_url(self) -> str:
        db_path = self.resolved_db_path
        if self.database.engine == "duckdb":
            return f"duckdb:///{db_path}"
        return f"sqlite:///{db_path}"

    @property
    def capabilities(self) -> Capabilities:
        return Capabilities(
            agent=bool(self.agent.endpoint.strip()),
            real_estate=bool(
                self.real_estate.enabled
                and self.real_estate.metro_csv_url.strip()
                and self.real_estate.zip_csv_url.strip()
            ),
        )


def get_config_path() -> Path:
    return Path(os.environ.get("FOLIO_CONFIG", "~/.folio/config.yaml")).expanduser()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    config_path = get_config_path()
    payload: dict[str, object] = {}
    if config_path.exists():
        payload = yaml.safe_load(config_path.read_text()) or {}
    return Settings.model_validate(payload)
