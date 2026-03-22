from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from backend.models.db import BookAllocation, BookCollection, Portfolio, Position, Workspace
from backend.services.agent_service import AgentService
from backend.services.market_data import ResolvedPrice

from .conftest import add_price_history, recent_business_series


def seed_workspace_prices(db_session):
    tickers = {
        "SPY": recent_business_series(60, 100, 1),
        "VTI": recent_business_series(60, 200, 2),
        "QQQ": recent_business_series(60, 300, 3),
        "TLT": recent_business_series(60, 90, 1),
        "GLD": recent_business_series(60, 180, 1.5),
        "AAPL": recent_business_series(60, 150, 2.5),
    }
    for ticker, series in tickers.items():
        add_price_history(db_session, ticker, series)
    return tickers


def first_monday(series: list[tuple[date, float]]) -> date:
    return next(item[0] for item in series if item[0].weekday() == 0)


def write_zillow_fixture(path: Path, rows: list[dict[str, object]]) -> None:
    metadata_headers = ["RegionID", "RegionName", "City", "StateName", "Metro"]
    series_headers = [key for key in rows[0].keys() if key not in metadata_headers]
    headers = [*metadata_headers, *series_headers]
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(str(row.get(header, "")) for header in headers))
    path.write_text("\n".join(lines))


def create_workspace(client, start_date: date) -> str:
    created = client.post("/api/v1/workspaces", json={"start_date": start_date.isoformat()})
    assert created.status_code == 201
    return created.json()["id"]


def default_collection_id(client, workspace_id: str) -> str:
    view = client.get(f"/api/v1/workspaces/{workspace_id}/view")
    assert view.status_code == 200
    return view.json()["collections"][0]["id"]


def create_collection(client, workspace_id: str, *, initial_cash: int = 10_000, name: str | None = None) -> str:
    payload = {"initial_cash": initial_cash}
    if name is not None:
        payload["name"] = name
    created = client.post(f"/api/v1/workspaces/{workspace_id}/collections", json=payload)
    assert created.status_code == 201
    return created.json()["id"]


def create_book(client, collection_id: str, payload: dict[str, object]) -> str:
    created = client.post(f"/api/v1/collections/{collection_id}/books", json=payload)
    assert created.status_code == 201
    return created.json()["id"]


def create_positioned_book(client, db_session) -> tuple[str, str]:
    prices = seed_workspace_prices(db_session)
    workspace_id = create_workspace(client, first_monday(prices["VTI"]) - timedelta(days=2))
    collection_id = default_collection_id(client, workspace_id)
    book_id = create_book(
        client,
        collection_id,
        {
            "name": "Core",
            "description": "Main",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 60},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 20},
                {"ticker": "GLD", "asset_type": "etf", "weight": 10},
                {"ticker": "TLT", "asset_type": "etf", "weight": 10},
            ],
        },
    )
    return workspace_id, book_id


def patch_1998_opening_session(monkeypatch):
    lookup = {
        "SPY": ResolvedPrice(ticker="SPY", date=date(1998, 2, 18), close=Decimal("100")),
        "VTI": ResolvedPrice(ticker="VTI", date=date(1998, 2, 18), close=Decimal("100")),
        "QQQ": ResolvedPrice(ticker="QQQ", date=date(1998, 2, 18), close=Decimal("100")),
        "TLT": ResolvedPrice(ticker="TLT", date=date(1998, 2, 18), close=Decimal("100")),
        "GLD": ResolvedPrice(ticker="GLD", date=date(2004, 11, 18), close=Decimal("100")),
    }

    def resolve_first_prices_on_or_after(self, tickers, target_date):  # noqa: ANN001
        return {ticker.strip().upper(): lookup.get(ticker.strip().upper()) for ticker in tickers}

    monkeypatch.setattr(
        "backend.services.market_data.MarketDataService.resolve_first_prices_on_or_after",
        resolve_first_prices_on_or_after,
    )


def test_workspace_flow_supports_collections_comparison_and_snapshot(client, db_session):
    prices = seed_workspace_prices(db_session)
    workspace_start = first_monday(prices["VTI"]) - timedelta(days=2)
    opening_session = first_monday(prices["VTI"])

    workspace_id = create_workspace(client, workspace_start)
    primary_collection_id = default_collection_id(client, workspace_id)
    secondary_collection_id = create_collection(client, workspace_id, initial_cash=10_000, name="Collection 2")

    listing = client.get("/api/v1/workspaces")
    assert listing.status_code == 200
    assert listing.json()[0]["book_count"] == 0
    assert listing.json()[0]["collection_count"] == 2
    assert listing.json()[0]["run_state"]["status"] == "draft"

    core_book_create = client.post(
        f"/api/v1/collections/{primary_collection_id}/books",
        json={
            "name": "Core",
            "description": "Preset spread",
            "strategy_kind": "preset",
            "preset_id": "core",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 60},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 20},
                {"ticker": "GLD", "asset_type": "etf", "weight": 10},
                {"ticker": "TLT", "asset_type": "etf", "weight": 10},
            ],
        },
    )
    assert core_book_create.status_code == 201
    core_book_payload = core_book_create.json()
    core_book_id = core_book_payload["id"]
    assert core_book_payload["collection_id"] == primary_collection_id
    assert core_book_payload["strategy_kind"] == "preset"
    assert core_book_payload["preset_id"] == "core"
    assert core_book_payload["run_state"]["status"] == "ready"

    challenger_book_id = create_book(
        client,
        secondary_collection_id,
        {
            "name": "Tech Tilt",
            "description": "Custom basket",
            "strategy_kind": "custom",
            "allocations": [
                {"ticker": "QQQ", "asset_type": "etf", "weight": 60},
                {"ticker": "AAPL", "asset_type": "stock", "weight": 40},
            ],
        },
    )

    workspace = client.get(f"/api/v1/workspaces/{workspace_id}")
    assert workspace.status_code == 200
    assert workspace.json()["book_count"] == 2
    assert workspace.json()["collection_count"] == 2
    assert workspace.json()["run_state"]["status"] == "ready"
    assert workspace.json()["run_state"]["opening_session"] == opening_session.isoformat()

    view = client.get(f"/api/v1/workspaces/{workspace_id}/view")
    assert view.status_code == 200
    view_payload = view.json()
    assert view_payload["workspace"]["id"] == workspace_id
    assert view_payload["workspace"]["run_state"]["status"] == "ready"
    assert len(view_payload["collections"]) == 2
    assert {collection["name"] for collection in view_payload["collections"]} == {"Collection 1", "Collection 2"}
    assert {
        book["name"]
        for collection in view_payload["collections"]
        for book in collection["books"]
    } == {"Core", "Tech Tilt"}

    comparison = client.post(
        f"/api/v1/workspaces/{workspace_id}/comparison",
        json={"benchmark_tickers": ["SPY", "QQQ"], "primary_benchmark_ticker": "QQQ"},
    )
    assert comparison.status_code == 200
    comparison_payload = comparison.json()
    assert comparison_payload["workspace_id"] == workspace_id
    assert comparison_payload["primary_benchmark_ticker"] == "QQQ"
    assert set(comparison_payload["benchmark_tickers"]) == {"SPY", "QQQ"}
    assert len(comparison_payload["benchmark_series"]) == 2
    assert len(comparison_payload["points"]) >= 50
    first_point = comparison_payload["points"][0]
    assert set(first_point["book_values"]) == {core_book_id, challenger_book_id}
    assert any(series["label"] == "QQQ" for series in comparison_payload["benchmark_series"])

    starting_snapshot = client.get(
        f"/api/v1/books/{core_book_id}/snapshot",
        params={"as_of": workspace_start.isoformat(), "benchmark_ticker": "QQQ"},
    )
    assert starting_snapshot.status_code == 200
    starting_payload = starting_snapshot.json()
    assert starting_payload["collection_id"] == primary_collection_id
    assert starting_payload["as_of"] == workspace_start.isoformat()
    assert starting_payload["metrics"]["position_count"] == 0
    assert starting_payload["allocation"][0]["ticker"] == "CASH"

    midpoint = comparison_payload["points"][20]["date"]
    snapshot = client.get(
        f"/api/v1/books/{core_book_id}/snapshot",
        params={"as_of": midpoint, "benchmark_ticker": "QQQ"},
    )
    assert snapshot.status_code == 200
    snapshot_payload = snapshot.json()
    assert snapshot_payload["id"] == core_book_id
    assert snapshot_payload["as_of"] == midpoint
    assert snapshot_payload["metrics"]["book_id"] == core_book_id
    assert snapshot_payload["metrics"]["position_count"] == 4
    assert snapshot_payload["metrics"]["benchmark_ticker"] == "QQQ"
    assert {item["ticker"] for item in snapshot_payload["positions"]} == {"VTI", "QQQ", "GLD", "TLT"}


def test_collection_update_reseeds_books_from_collection_bankroll(client, db_session):
    prices = seed_workspace_prices(db_session)
    workspace_start = first_monday(prices["VTI"]) - timedelta(days=2)
    workspace_id = create_workspace(client, workspace_start)
    collection_id = default_collection_id(client, workspace_id)
    book_id = create_book(
        client,
        collection_id,
        {
            "name": "Core",
            "description": "Preset spread",
            "strategy_kind": "preset",
            "preset_id": "core",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 60},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 20},
                {"ticker": "GLD", "asset_type": "etf", "weight": 10},
                {"ticker": "TLT", "asset_type": "etf", "weight": 10},
            ],
        },
    )

    updated_collection = client.patch(
        f"/api/v1/collections/{collection_id}",
        json={"initial_cash": 25000, "name": "Large Cap Cohort"},
    )
    assert updated_collection.status_code == 200
    collection_payload = updated_collection.json()
    assert collection_payload["name"] == "Large Cap Cohort"
    assert collection_payload["initial_cash"] == 25000

    refreshed_view = client.get(f"/api/v1/workspaces/{workspace_id}/view")
    assert refreshed_view.status_code == 200
    refreshed_payload = refreshed_view.json()
    collection_payload = next(item for item in refreshed_payload["collections"] if item["id"] == collection_id)
    assert collection_payload["name"] == "Large Cap Cohort"
    assert collection_payload["initial_cash"] == 25000
    assert collection_payload["books"][0]["initial_cash"] == 25000

    updated_snapshot = client.get(
        f"/api/v1/books/{book_id}/snapshot",
        params={"as_of": workspace_start.isoformat(), "benchmark_ticker": "QQQ"},
    )
    assert updated_snapshot.status_code == 200
    assert updated_snapshot.json()["initial_cash"] == 25000
    assert updated_snapshot.json()["metrics"]["benchmark_ticker"] == "QQQ"


def test_workspace_and_book_validation_reject_invalid_requests(client, db_session):
    seed_workspace_prices(db_session)
    future_start = date.today() + timedelta(days=1)

    future_workspace = client.post("/api/v1/workspaces", json={"start_date": future_start.isoformat()})
    assert future_workspace.status_code == 422
    assert future_workspace.json()["detail"]["code"] == "workspace_invalid"

    workspace_id = create_workspace(client, date.today() - timedelta(days=30))
    collection_id = default_collection_id(client, workspace_id)

    overweight = client.post(
        f"/api/v1/collections/{collection_id}/books",
        json={
            "name": "Too Heavy",
            "description": "",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 80},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 30},
            ],
        },
    )
    assert overweight.status_code == 422
    assert overweight.json()["detail"]["code"] == "book_invalid"

    duplicates = client.post(
        f"/api/v1/collections/{collection_id}/books",
        json={
            "name": "Duplicates",
            "description": "",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 50},
                {"ticker": "vti", "asset_type": "etf", "weight": 50},
            ],
        },
    )
    assert duplicates.status_code == 422
    assert duplicates.json()["detail"]["code"] == "book_invalid"

    empty = client.post(
        f"/api/v1/collections/{collection_id}/books",
        json={
            "name": "Empty",
            "description": "",
            "allocations": [{"ticker": "VTI", "asset_type": "etf", "weight": 0}],
        },
    )
    assert empty.status_code == 422
    assert empty.json()["detail"]["code"] == "book_invalid"

    view = client.get(f"/api/v1/workspaces/{workspace_id}/view")
    assert view.status_code == 200
    assert view.json()["collections"][0]["books"] == []


def test_workspace_availability_rejects_unavailable_book(client, monkeypatch):
    patch_1998_opening_session(monkeypatch)
    workspace_id = create_workspace(client, date(1998, 2, 18))
    collection_id = default_collection_id(client, workspace_id)

    availability = client.post(
        f"/api/v1/workspaces/{workspace_id}/availability",
        json={"tickers": ["VTI", "QQQ", "TLT", "GLD"]},
    )
    assert availability.status_code == 200
    payload = availability.json()
    assert payload["opening_session"] == "1998-02-18"
    availability_by_ticker = {item["ticker"]: item for item in payload["tickers"]}
    assert availability_by_ticker["VTI"]["available"] is True
    assert availability_by_ticker["QQQ"]["available"] is True
    assert availability_by_ticker["TLT"]["available"] is True
    assert availability_by_ticker["GLD"]["available"] is False
    assert availability_by_ticker["GLD"]["first_tradable_date"] == "2004-11-18"

    create_core = client.post(
        f"/api/v1/collections/{collection_id}/books",
        json={
            "name": "Core",
            "description": "Preset spread",
            "strategy_kind": "preset",
            "preset_id": "core",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 60},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 20},
                {"ticker": "GLD", "asset_type": "etf", "weight": 10},
                {"ticker": "TLT", "asset_type": "etf", "weight": 10},
            ],
        },
    )
    assert create_core.status_code == 422
    assert create_core.json()["detail"]["code"] == "book_unavailable_for_workspace"

    view = client.get(f"/api/v1/workspaces/{workspace_id}/view")
    assert view.status_code == 200
    assert view.json()["collections"][0]["books"] == []


def test_workspace_delete_removes_workspace_from_followup_list(client, db_session):
    prices = seed_workspace_prices(db_session)
    workspace_start = first_monday(prices["VTI"]) - timedelta(days=2)
    workspace_id = create_workspace(client, workspace_start)
    collection_id = default_collection_id(client, workspace_id)

    create_book(
        client,
        collection_id,
        {
            "name": "Core",
            "description": "Preset spread",
            "strategy_kind": "preset",
            "preset_id": "core",
            "allocations": [
                {"ticker": "VTI", "asset_type": "etf", "weight": 60},
                {"ticker": "QQQ", "asset_type": "etf", "weight": 20},
                {"ticker": "GLD", "asset_type": "etf", "weight": 10},
                {"ticker": "TLT", "asset_type": "etf", "weight": 10},
            ],
        },
    )

    deleted = client.delete(f"/api/v1/workspaces/{workspace_id}")
    assert deleted.status_code == 204

    listing = client.get("/api/v1/workspaces")
    assert listing.status_code == 200
    assert all(item["id"] != workspace_id for item in listing.json())

    workspace = client.get(f"/api/v1/workspaces/{workspace_id}")
    assert workspace.status_code == 404


def test_blocked_legacy_book_returns_blocked_view_comparison_and_snapshot_error(client, db_session, monkeypatch):
    patch_1998_opening_session(monkeypatch)

    workspace = Workspace(
        name="February 18, 1998",
        start_date=date(1998, 2, 18),
        initial_cash=Decimal("10000"),
    )
    collection = BookCollection(name="Collection 1", initial_cash=Decimal("10000"), workspace=workspace)
    book = Portfolio(
        workspace=workspace,
        collection=collection,
        name="Core",
        description="Legacy seeded book",
        initial_cash=Decimal("10000"),
        strategy_kind="preset",
        preset_id="core",
    )
    book.allocations = [
        BookAllocation(asset_type="etf", ticker="VTI", weight=Decimal("60"), sort_order=0),
        BookAllocation(asset_type="etf", ticker="QQQ", weight=Decimal("20"), sort_order=1),
        BookAllocation(asset_type="etf", ticker="GLD", weight=Decimal("10"), sort_order=2),
        BookAllocation(asset_type="etf", ticker="TLT", weight=Decimal("10"), sort_order=3),
    ]
    book.positions = [
        Position(asset_type="etf", ticker="VTI", shares=Decimal("1"), entry_price=Decimal("100"), entry_date=date(1998, 2, 18), notes=""),
        Position(asset_type="etf", ticker="QQQ", shares=Decimal("1"), entry_price=Decimal("100"), entry_date=date(1998, 2, 18), notes=""),
        Position(asset_type="etf", ticker="TLT", shares=Decimal("1"), entry_price=Decimal("100"), entry_date=date(1998, 2, 18), notes=""),
        Position(asset_type="etf", ticker="GLD", shares=Decimal("1"), entry_price=Decimal("100"), entry_date=date(2004, 11, 18), notes=""),
    ]
    db_session.add(workspace)
    db_session.add(collection)
    db_session.add(book)
    db_session.commit()

    view = client.get(f"/api/v1/workspaces/{workspace.id}/view")
    assert view.status_code == 200
    view_payload = view.json()
    assert view_payload["workspace"]["run_state"]["status"] == "blocked"
    assert view_payload["collections"][0]["run_state"]["status"] == "blocked"
    assert view_payload["collections"][0]["books"][0]["run_state"]["status"] == "blocked"
    assert "GLD" in view_payload["collections"][0]["books"][0]["run_state"]["issues"][0]["message"]

    comparison = client.post(
        f"/api/v1/workspaces/{workspace.id}/comparison",
        json={"benchmark_tickers": ["SPY"], "primary_benchmark_ticker": "SPY"},
    )
    assert comparison.status_code == 200
    assert comparison.json()["points"] == []

    snapshot = client.get(f"/api/v1/books/{book.id}/snapshot", params={"as_of": "1998-02-18"})
    assert snapshot.status_code == 409
    assert snapshot.json()["detail"]["code"] == "book_blocked"


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


def test_app_settings_update_overrides_bootstrap(client):
    settings = client.get("/api/v1/app/settings")
    assert settings.status_code == 200
    assert settings.json()["market"]["benchmark_ticker"] == "SPY"
    assert settings.json()["capabilities"]["agent"] is False
    assert settings.json()["capabilities"]["real_estate"] is False

    updated = client.patch(
        "/api/v1/app/settings",
        json={
            "market": {"benchmark_ticker": "qqq", "risk_free_rate": 5.1, "cache_ttl_days": 7},
            "agent": {"endpoint": "http://localhost:11434/v1", "model": "llama3.2"},
            "scheduler": {"enabled": True, "price_refresh_cron": "0 20 * * 1-5"},
        },
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["market"]["benchmark_ticker"] == "QQQ"
    assert payload["market"]["risk_free_rate"] == 5.1
    assert payload["agent"]["endpoint"] == "http://localhost:11434/v1"
    assert payload["capabilities"]["agent"] is True

    bootstrap = client.get("/api/v1/app/bootstrap")
    assert bootstrap.status_code == 200
    assert bootstrap.json()["benchmark_ticker"] == "QQQ"
    assert bootstrap.json()["risk_free_rate"] == 5.1
    assert bootstrap.json()["capabilities"]["agent"] is True


def test_real_estate_search_remains_available_when_enabled(client, test_env):
    tmp_path = test_env["tmp_path"]
    zip_csv = tmp_path / "zip.csv"
    metro_csv = tmp_path / "metro.csv"
    first_point = (date.today() - timedelta(days=75)).isoformat()
    second_point = (date.today() - timedelta(days=45)).isoformat()
    third_point = (date.today() - timedelta(days=15)).isoformat()
    write_zillow_fixture(
        zip_csv,
        [
            {
                "RegionID": "94105",
                "RegionName": "94105",
                "City": "San Francisco",
                "StateName": "CA",
                "Metro": "San Francisco-Oakland-Berkeley",
                first_point: 690000,
                second_point: 705000,
                third_point: 725000,
            }
        ],
    )
    write_zillow_fixture(
        metro_csv,
        [
            {
                "RegionID": "42",
                "RegionName": "Austin",
                "City": "Austin",
                "StateName": "TX",
                "Metro": "Austin-Round Rock-Georgetown",
                first_point: 430000,
                second_point: 435000,
                third_point: 440000,
            }
        ],
    )

    configured = client.patch(
        "/api/v1/app/settings",
        json={
            "real_estate": {
                "enabled": True,
                "metro_csv_url": str(metro_csv),
                "zip_csv_url": str(zip_csv),
                "cache_ttl_days": 31,
                "search_limit": 10,
            }
        },
    )
    assert configured.status_code == 200
    assert configured.json()["capabilities"]["real_estate"] is True

    zip_search = client.get("/api/v1/market/real-estate/search", params={"q": "94105"})
    assert zip_search.status_code == 200
    assert zip_search.json()[0]["ticker"] == "RE:94105"

    metro_search = client.get("/api/v1/market/real-estate/metros", params={"q": "Austin"})
    assert metro_search.status_code == 200
    assert metro_search.json()[0]["ticker"] == "RE:METRO:42"


def test_agent_routes_stream_and_persist_history(client, db_session, monkeypatch):
    _, book_id = create_positioned_book(client, db_session)
    captured_messages: list[list[dict[str, str]]] = []

    def agent_enabled(self) -> None:
        return None

    async def fake_stream(self, messages):
        captured_messages.append(list(messages))
        prompt = messages[-1]["content"]
        if prompt.startswith("Analyze this portfolio."):
            yield "Top performer: QQQ. "
            yield "Watch the position sizing."
            return
        if "Sharpe so low" in prompt:
            yield "Your Sharpe is being diluted by idle cash and a short holding window."
            return
        yield "You have lagged SPY because most gains came from a single position."

    monkeypatch.setattr(AgentService, "ensure_enabled", agent_enabled)
    monkeypatch.setattr(AgentService, "stream_completion", fake_stream)

    with client.stream("POST", "/api/v1/agent/analyze", json={"portfolio_id": book_id}) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "Top performer: QQQ." in body
    assert "event: done" in body
    assert "PORTFOLIO: Core" in captured_messages[0][0]["content"]

    with client.websocket_connect(f"/api/v1/agent/chat?portfolio_id={book_id}") as websocket:
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

    history = client.get(f"/api/v1/agent/history/{book_id}")
    assert history.status_code == 200
    assert [item["role"] for item in history.json()] == ["user", "assistant", "user", "assistant"]

    cleared = client.delete(f"/api/v1/agent/history/{book_id}")
    assert cleared.status_code == 204
    assert client.get(f"/api/v1/agent/history/{book_id}").json() == []
