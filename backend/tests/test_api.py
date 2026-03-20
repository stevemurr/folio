from __future__ import annotations

from datetime import date, timedelta

from backend.services.agent_service import AgentService

from .conftest import add_price_history, recent_business_series


def seed_portfolio_prices(db_session):
    spy_series = recent_business_series(40, 100, 1)
    asset_series = recent_business_series(40, 120, 2)
    add_price_history(db_session, "SPY", spy_series)
    add_price_history(db_session, "NVDA", asset_series)
    return asset_series


def create_positioned_portfolio(client, db_session) -> str:
    asset_series = seed_portfolio_prices(db_session)
    created = client.post(
        "/api/v1/portfolios",
        json={"name": "Core", "description": "Main", "initial_cash": 10000},
    )
    portfolio_id = created.json()["id"]
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
    return portfolio_id


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

    history = client.get("/api/v1/agent/history/missing")
    assert history.status_code == 501
    assert history.json()["detail"]["code"] == "capability_disabled"


def test_agent_routes_stream_and_persist_history(client, db_session, monkeypatch):
    portfolio_id = create_positioned_portfolio(client, db_session)
    captured_messages: list[list[dict[str, str]]] = []

    def agent_enabled(self) -> None:
        return None

    async def fake_stream(self, messages):
        captured_messages.append(list(messages))
        prompt = messages[-1]["content"]
        if prompt.startswith("Analyze this portfolio."):
            yield "Top performer: NVDA. "
            yield "Watch the position sizing."
            return
        if "Sharpe so low" in prompt:
            yield "Your Sharpe is being diluted by idle cash and a short holding window."
            return
        yield "You have lagged SPY because most gains came from a single position."

    monkeypatch.setattr(AgentService, "ensure_enabled", agent_enabled)
    monkeypatch.setattr(AgentService, "stream_completion", fake_stream)

    with client.stream("POST", "/api/v1/agent/analyze", json={"portfolio_id": portfolio_id}) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: message" in body
    assert "Top performer: NVDA." in body
    assert "event: done" in body
    assert "PORTFOLIO: Core" in captured_messages[0][0]["content"]
    assert captured_messages[0][-1]["content"].startswith("Analyze this portfolio.")

    with client.websocket_connect(f"/api/v1/agent/chat?portfolio_id={portfolio_id}") as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"

        websocket.send_json({"type": "message", "content": "Why is my Sharpe so low?"})
        assert websocket.receive_json()["type"] == "assistant_start"
        delta = websocket.receive_json()
        assert delta["type"] == "assistant_delta"
        assert "idle cash" in delta["delta"]
        saved = websocket.receive_json()
        assert saved["type"] == "assistant_message"
        assert "idle cash" in saved["message"]["content"]

        websocket.send_json({"type": "message", "content": "Compare my performance to SPY"})
        assert websocket.receive_json()["type"] == "assistant_start"
        second_delta = websocket.receive_json()
        assert second_delta["type"] == "assistant_delta"
        assert "lagged SPY" in second_delta["delta"]
        second_saved = websocket.receive_json()
        assert second_saved["type"] == "assistant_message"
        assert "lagged SPY" in second_saved["message"]["content"]

    assert any(item["content"] == "Why is my Sharpe so low?" for item in captured_messages[2])
    assert any(
        "idle cash and a short holding window." in item["content"] for item in captured_messages[2]
    )
    assert captured_messages[2][-1]["content"] == "Compare my performance to SPY"

    history = client.get(f"/api/v1/agent/history/{portfolio_id}")
    assert history.status_code == 200
    assert [item["role"] for item in history.json()] == ["user", "assistant", "user", "assistant"]

    cleared = client.delete(f"/api/v1/agent/history/{portfolio_id}")
    assert cleared.status_code == 204
    assert client.get(f"/api/v1/agent/history/{portfolio_id}").json() == []
