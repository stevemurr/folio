from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.database import get_db
from backend.errors import ApiErrorException
from backend.models.db import Portfolio, Position
from backend.models.schemas import PortfolioCreate, PortfolioDetail, PortfolioSummary, PositionCreate, PositionWithMetrics
from backend.services.market_data import MarketDataService
from backend.services.portfolio_engine import PortfolioEngine

router = APIRouter(tags=["portfolios"])


@router.get("/portfolios", response_model=list[PortfolioSummary])
def list_portfolios(db: Session = Depends(get_db)) -> list[PortfolioSummary]:
    portfolios = db.execute(
        select(Portfolio).options(selectinload(Portfolio.positions)).order_by(Portfolio.created_at.desc())
    ).scalars().all()
    return [
        PortfolioSummary(
            id=portfolio.id,
            name=portfolio.name,
            description=portfolio.description,
            created_at=portfolio.created_at,
            base_currency=portfolio.base_currency,
            initial_cash=float(portfolio.initial_cash),
            open_positions=sum(1 for position in portfolio.positions if position.exit_date is None),
            total_positions=len(portfolio.positions),
        )
        for portfolio in portfolios
    ]


@router.post("/portfolios", response_model=PortfolioSummary, status_code=status.HTTP_201_CREATED)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)) -> PortfolioSummary:
    portfolio = Portfolio(
        name=payload.name.strip(),
        description=payload.description.strip(),
        initial_cash=payload.initial_cash,
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return PortfolioSummary(
        id=portfolio.id,
        name=portfolio.name,
        description=portfolio.description,
        created_at=portfolio.created_at,
        base_currency=portfolio.base_currency,
        initial_cash=float(portfolio.initial_cash),
        open_positions=0,
        total_positions=0,
    )


@router.get("/portfolios/{portfolio_id}", response_model=PortfolioDetail)
def get_portfolio(portfolio_id: str, db: Session = Depends(get_db)) -> PortfolioDetail:
    engine = PortfolioEngine(db)
    return engine.build_portfolio_detail(portfolio_id)


@router.delete("/portfolios/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(portfolio_id: str, db: Session = Depends(get_db)) -> Response:
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise ApiErrorException(404, "portfolio_not_found", "Portfolio not found.")
    db.delete(portfolio)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/portfolios/{portfolio_id}/positions", response_model=list[PositionWithMetrics])
def list_positions(portfolio_id: str, db: Session = Depends(get_db)) -> list[PositionWithMetrics]:
    engine = PortfolioEngine(db)
    portfolio = engine.get_portfolio(portfolio_id)
    return engine.analyze_portfolio(portfolio).positions


@router.post(
    "/portfolios/{portfolio_id}/positions",
    response_model=PositionWithMetrics,
    status_code=status.HTTP_201_CREATED,
)
def add_position(
    portfolio_id: str,
    payload: PositionCreate,
    db: Session = Depends(get_db),
) -> PositionWithMetrics:
    engine = PortfolioEngine(db)
    market_data = MarketDataService(db)
    portfolio = engine.get_portfolio(portfolio_id)
    resolved = market_data.resolve_price_on_or_before(payload.ticker, payload.entry_date)
    position = Position(
        portfolio_id=portfolio.id,
        asset_type=payload.asset_type,
        ticker=resolved.ticker,
        shares=payload.shares,
        entry_price=resolved.close,
        entry_date=resolved.date,
        notes=payload.notes.strip(),
    )
    engine.assert_cash_valid(portfolio, [*portfolio.positions, position])
    db.add(position)
    db.commit()
    db.refresh(position)

    refreshed = engine.analyze_portfolio(engine.get_portfolio(portfolio.id)).positions
    for item in refreshed:
        if item.id == position.id:
            return item
    raise ApiErrorException(500, "position_missing", "Position was created but could not be reloaded.")
