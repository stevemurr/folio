from __future__ import annotations

from datetime import date

import pytest

from backend.errors import ApiErrorException
from backend.models.db import Position
from backend.services.portfolio_engine import PortfolioEngine

from .conftest import add_price_history, create_portfolio, create_workspace, recent_business_series


def test_cash_validation_rejects_negative_replay(db_session):
    portfolio = create_portfolio(db_session, initial_cash=1_000)
    first = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="AAA",
        shares=8,
        entry_price=100,
        entry_date=date(2024, 1, 3),
        notes="",
    )
    second = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="BBB",
        shares=4,
        entry_price=100,
        entry_date=date(2024, 1, 5),
        notes="",
    )
    candidate = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="CCC",
        shares=3,
        entry_price=100,
        entry_date=date(2024, 1, 2),
        notes="",
    )

    with pytest.raises(ApiErrorException) as error:
        PortfolioEngine(db_session).assert_cash_valid(portfolio, [first, second, candidate])

    assert error.value.code == "insufficient_cash"


def test_cash_validation_allows_exit_funding_same_day_entry(db_session):
    portfolio = create_portfolio(db_session, initial_cash=1_000)
    sold = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="AAA",
        shares=8,
        entry_price=100,
        entry_date=date(2024, 1, 2),
        exit_price=120,
        exit_date=date(2024, 1, 5),
        notes="",
    )
    new_buy = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="BBB",
        shares=9,
        entry_price=100,
        entry_date=date(2024, 1, 5),
        notes="",
    )

    PortfolioEngine(db_session).assert_cash_valid(portfolio, [sold, new_buy])


def test_portfolio_analysis_reconstructs_values_and_allocation(db_session):
    spy_series = recent_business_series(40, 100, 1)
    asset_series = recent_business_series(40, 100, 2)
    workspace = create_workspace(db_session, start_date=asset_series[0][0])
    portfolio = create_portfolio(db_session, initial_cash=1_000, workspace=workspace)
    add_price_history(db_session, "SPY", spy_series)
    add_price_history(db_session, "AAPL", asset_series)

    position = Position(
        portfolio_id=portfolio.id,
        asset_type="stock",
        ticker="AAPL",
        shares=2,
        entry_price=100,
        entry_date=asset_series[0][0],
        notes="",
    )
    db_session.add(position)
    db_session.commit()
    db_session.refresh(portfolio)

    analysis = PortfolioEngine(db_session).analyze_portfolio(portfolio)

    assert analysis.metrics.total_value > 1_000
    assert analysis.metrics.current_cash == pytest.approx(800)
    assert analysis.metrics.sharpe_ratio is not None
    assert len(analysis.timeseries) == 40
    assert analysis.timeseries[-1].book_value == pytest.approx(analysis.metrics.total_value)
    assert analysis.allocation[0].ticker == "CASH"
    open_position = next(item for item in analysis.positions if item.ticker == "AAPL")
    assert open_position.current_price == pytest.approx(178)
    assert open_position.weight > 0


def test_portfolio_sharpe_requires_minimum_history(db_session):
    spy_series = recent_business_series(10, 100, 1)
    asset_series = recent_business_series(10, 100, 2)
    workspace = create_workspace(db_session, start_date=asset_series[0][0])
    portfolio = create_portfolio(db_session, initial_cash=1_000, workspace=workspace)
    add_price_history(db_session, "SPY", spy_series)
    add_price_history(db_session, "AAPL", asset_series)
    db_session.add(
        Position(
            portfolio_id=portfolio.id,
            asset_type="stock",
            ticker="AAPL",
            shares=1,
            entry_price=100,
            entry_date=asset_series[0][0],
            notes="",
        )
    )
    db_session.commit()
    db_session.refresh(portfolio)

    analysis = PortfolioEngine(db_session).analyze_portfolio(portfolio)
    assert analysis.metrics.sharpe_ratio is None
