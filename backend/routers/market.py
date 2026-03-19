from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.errors import ApiErrorException
from backend.models.schemas import MarketPriceResponse, MarketSearchResult, PricePoint
from backend.services.market_data import MarketDataService

router = APIRouter(tags=["market"])


@router.get("/market/search", response_model=list[MarketSearchResult])
def search_market(q: str = Query(min_length=1), db: Session = Depends(get_db)) -> list[MarketSearchResult]:
    return MarketDataService(db).search_tickers(q)


@router.get("/market/price/{ticker}", response_model=MarketPriceResponse)
def get_market_price(ticker: str, db: Session = Depends(get_db)) -> MarketPriceResponse:
    return MarketDataService(db).get_latest_price(ticker)


@router.get("/market/history/{ticker}", response_model=list[PricePoint])
def get_market_history(
    ticker: str,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> list[PricePoint]:
    end_date = to_date or date.today()
    start_date = from_date or (end_date - timedelta(days=365))
    return MarketDataService(db).get_history(ticker, start_date, end_date)


@router.get("/market/real-estate/metros")
def list_real_estate_metros() -> None:
    raise ApiErrorException(501, "capability_disabled", "Real estate support is disabled in the MVP.")

