from __future__ import annotations

from decimal import Decimal

import pytest

from backend.errors import ApiErrorException
from backend.models.schemas import BookAllocationCreate, WorkspaceComparisonRequest
from backend.services.workspace_allocations import normalize_book_allocations
from backend.services.workspace_comparison import resolve_comparison_request


def test_normalize_book_allocations_uppercases_and_filters_zero_weights():
    normalized = normalize_book_allocations(
        [
            BookAllocationCreate(ticker=" vti ", asset_type="etf", weight=Decimal("60")),
            BookAllocationCreate(ticker="QQQ", asset_type="etf", weight=Decimal("40")),
            BookAllocationCreate(ticker="GLD", asset_type="etf", weight=Decimal("0")),
        ]
    )

    assert [item.ticker for item in normalized] == ["VTI", "QQQ"]


def test_normalize_book_allocations_rejects_duplicate_tickers():
    with pytest.raises(ApiErrorException) as error:
        normalize_book_allocations(
            [
                BookAllocationCreate(ticker="vti", asset_type="etf", weight=Decimal("60")),
                BookAllocationCreate(ticker="VTI", asset_type="etf", weight=Decimal("40")),
            ]
        )

    assert error.value.code == "book_invalid"


def test_resolve_comparison_request_uses_primary_when_overlay_list_is_empty():
    benchmark_tickers, primary = resolve_comparison_request(
        payload=WorkspaceComparisonRequest(benchmark_tickers=[], primary_benchmark_ticker="qqq"),
        default_ticker="SPY",
    )

    assert primary == "QQQ"
    assert benchmark_tickers == ["QQQ"]
