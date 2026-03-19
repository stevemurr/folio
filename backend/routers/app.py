from __future__ import annotations

from fastapi import APIRouter

from backend.config import get_settings
from backend.models.schemas import BootstrapConfig

router = APIRouter(tags=["app"])


@router.get("/app/bootstrap", response_model=BootstrapConfig)
def get_bootstrap() -> BootstrapConfig:
    settings = get_settings()
    return BootstrapConfig(
        risk_free_rate=settings.market.risk_free_rate,
        benchmark_ticker=settings.market.benchmark_ticker.upper(),
        capabilities=settings.capabilities.model_dump(),
    )

