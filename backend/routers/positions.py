from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.errors import ApiErrorException
from backend.models.db import Position
from backend.models.schemas import PositionUpdate, PositionWithMetrics
from backend.services.market_data import MarketDataService
from backend.services.portfolio_engine import PortfolioEngine

router = APIRouter(tags=["positions"])


@router.patch("/positions/{position_id}", response_model=PositionWithMetrics)
def update_position(
    position_id: str,
    payload: PositionUpdate,
    db: Session = Depends(get_db),
) -> PositionWithMetrics:
    position = db.get(Position, position_id)
    if position is None:
        raise ApiErrorException(404, "position_not_found", "Position not found.")

    if payload.notes is not None:
        position.notes = payload.notes.strip()

    if payload.close:
        if position.exit_date is not None:
            raise ApiErrorException(409, "position_closed", "Position is already closed.")
        resolved = MarketDataService(db).resolve_price_on_or_before(position.ticker, date.today())
        position.exit_date = resolved.date
        position.exit_price = resolved.close

    db.add(position)
    db.commit()

    engine = PortfolioEngine(db)
    refreshed = engine.analyze_portfolio(engine.get_portfolio(position.portfolio_id)).positions
    for item in refreshed:
        if item.id == position.id:
            return item
    raise ApiErrorException(500, "position_missing", "Position update could not be reloaded.")


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_position(position_id: str, db: Session = Depends(get_db)) -> Response:
    position = db.get(Position, position_id)
    if position is None:
        raise ApiErrorException(404, "position_not_found", "Position not found.")
    db.delete(position)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

