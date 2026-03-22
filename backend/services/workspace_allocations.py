from __future__ import annotations

from decimal import Decimal

from backend.errors import ApiErrorException
from backend.models.db import BookAllocation
from backend.models.schemas import BookAllocationCreate


def normalize_book_allocations(allocations: list[BookAllocationCreate]) -> list[BookAllocationCreate]:
    positive_allocations = [item for item in allocations if item.weight > 0]
    if not positive_allocations:
        raise ApiErrorException(422, "book_invalid", "At least one allocation must have a weight greater than zero.")

    total_weight = sum((item.weight for item in positive_allocations), Decimal("0"))
    if total_weight > Decimal("100"):
        raise ApiErrorException(422, "book_invalid", "Book weights cannot exceed 100%.")

    normalized: list[BookAllocationCreate] = []
    seen_tickers: set[str] = set()
    for allocation in positive_allocations:
        ticker = allocation.ticker.strip().upper()
        if ticker in seen_tickers:
            raise ApiErrorException(422, "book_invalid", f"Duplicate ticker {ticker} is not allowed.")
        seen_tickers.add(ticker)
        normalized.append(
            BookAllocationCreate(
                ticker=ticker,
                asset_type=allocation.asset_type,
                weight=allocation.weight,
            )
        )
    return normalized


def book_allocation_inputs(allocations: list[BookAllocation]) -> list[BookAllocationCreate]:
    return [
        BookAllocationCreate(
            ticker=allocation.ticker,
            asset_type=allocation.asset_type,
            weight=allocation.weight,
        )
        for allocation in allocations
    ]
