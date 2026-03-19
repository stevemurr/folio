from __future__ import annotations

from datetime import date, timedelta

from .conftest import add_price_history, recent_business_series


def seed_portfolio_prices(db_session):
    spy_series = recent_business_series(40, 100, 1)
    asset_series = recent_business_series(40, 120, 2)
    add_price_history(db_session, "SPY", spy_series)
    add_price_history(db_session, "NVDA", asset_series)
    return asset_series


def test_portfolio_crud_and_position_flow(client, db_session):
    asset_series = seed_portfolio_prices(db_session)

    created = client.post(
        "/api/v1/portfolios",
        json={"name": "Core", "description": "Main", "initial_cash": 10000},
    )
    assert created.status_code == 201
    portfolio_id = created.json()["id"]

    listing = client.get("/api/v1/portfolios")
    assert listing.status_code == 200
    assert listing.json()[0]["name"] == "Core"

    added = client.post(
        f"/api/v1/portfolios/{portfolio_id}/positions",
        json={
                "asset_type": "stock",
                "ticker": "NVDA",
                "entry_date": asset_series[0][0].isoformat(),
                "shares": 10,
                "notes": "Starter",
            },
    )
    assert added.status_code == 201
    position_id = added.json()["id"]

    metrics = client.get(f"/api/v1/portfolios/{portfolio_id}/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["position_count"] == 1

    timeseries = client.get(f"/api/v1/portfolios/{portfolio_id}/timeseries")
    assert timeseries.status_code == 200
    assert len(timeseries.json()) == 40

    allocation = client.get(f"/api/v1/portfolios/{portfolio_id}/allocation")
    assert allocation.status_code == 200
    assert allocation.json()[0]["ticker"] in {"NVDA", "CASH"}

    closed = client.patch(f"/api/v1/positions/{position_id}", json={"close": True})
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"

    removed = client.delete(f"/api/v1/positions/{position_id}")
    assert removed.status_code == 204

    deleted = client.delete(f"/api/v1/portfolios/{portfolio_id}")
    assert deleted.status_code == 204


def test_position_add_rejects_insufficient_cash(client, db_session):
    asset_series = seed_portfolio_prices(db_session)
    created = client.post(
        "/api/v1/portfolios",
        json={"name": "Tight", "description": "", "initial_cash": 100},
    )
    portfolio_id = created.json()["id"]

    response = client.post(
        f"/api/v1/portfolios/{portfolio_id}/positions",
        json={
            "asset_type": "stock",
            "ticker": "NVDA",
            "entry_date": asset_series[0][0].isoformat(),
            "shares": 2,
            "notes": "",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "insufficient_cash"


def test_weekend_entry_uses_previous_trading_day(client, db_session):
    seed_portfolio_prices(db_session)
    created = client.post(
        "/api/v1/portfolios",
        json={"name": "Weekend", "description": "", "initial_cash": 10000},
    )
    portfolio_id = created.json()["id"]
    requested_entry = date.today()
    while requested_entry.weekday() != 5:
        requested_entry -= timedelta(days=1)
    expected_fill = requested_entry - timedelta(days=1)

    response = client.post(
        f"/api/v1/portfolios/{portfolio_id}/positions",
        json={
            "asset_type": "stock",
            "ticker": "NVDA",
            "entry_date": requested_entry.isoformat(),
            "shares": 1,
            "notes": "",
        },
    )
    assert response.status_code == 201
    assert response.json()["entry_date"] == expected_fill.isoformat()


def test_disabled_capability_routes(client):
    metros = client.get("/api/v1/market/real-estate/metros")
    assert metros.status_code == 501
    assert metros.json()["detail"]["code"] == "capability_disabled"

    analyze = client.post("/api/v1/agent/analyze", json={"portfolio_id": "missing"})
    assert analyze.status_code == 501
    assert analyze.json()["detail"]["code"] == "capability_disabled"
