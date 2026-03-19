from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import AllocationSlice, PortfolioMetrics, TimeSeriesPoint
from backend.services.portfolio_engine import PortfolioEngine

router = APIRouter(tags=["analytics"])


@router.get("/portfolios/{portfolio_id}/metrics", response_model=PortfolioMetrics)
def get_metrics(portfolio_id: str, db: Session = Depends(get_db)) -> PortfolioMetrics:
    engine = PortfolioEngine(db)
    portfolio = engine.get_portfolio(portfolio_id)
    return engine.analyze_portfolio(portfolio).metrics


@router.get("/portfolios/{portfolio_id}/timeseries", response_model=list[TimeSeriesPoint])
def get_timeseries(portfolio_id: str, db: Session = Depends(get_db)) -> list[TimeSeriesPoint]:
    engine = PortfolioEngine(db)
    portfolio = engine.get_portfolio(portfolio_id)
    return engine.analyze_portfolio(portfolio).timeseries


@router.get("/portfolios/{portfolio_id}/allocation", response_model=list[AllocationSlice])
def get_allocation(portfolio_id: str, db: Session = Depends(get_db)) -> list[AllocationSlice]:
    engine = PortfolioEngine(db)
    portfolio = engine.get_portfolio(portfolio_id)
    return engine.analyze_portfolio(portfolio).allocation

