from __future__ import annotations

from datetime import date

from backend.models.db import BookCollection, Portfolio, Workspace
from backend.models.schemas import (
    BookAllocationCreate,
    BookAllocationPreview,
    BookConfig,
    BookSummary,
    CollectionDetail,
    CollectionSummary,
    RunState,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceView,
)
from backend.services.run_eligibility import RunEligibilityService, WorkspaceEligibilitySnapshot


def format_workspace_name(start_date: date) -> str:
    return start_date.strftime("%B %d, %Y")


def book_count(workspace: Workspace) -> int:
    return sum(len(collection.portfolios) for collection in workspace.collections)


def workspace_summary(workspace: Workspace, run_state: RunState) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        start_date=workspace.start_date,
        created_at=workspace.created_at,
        book_count=book_count(workspace),
        collection_count=len(workspace.collections),
        run_state=run_state,
    )


def workspace_detail(workspace: Workspace, run_state: RunState) -> WorkspaceDetail:
    return WorkspaceDetail(
        id=workspace.id,
        name=workspace.name,
        start_date=workspace.start_date,
        created_at=workspace.created_at,
        book_count=book_count(workspace),
        collection_count=len(workspace.collections),
        run_state=run_state,
    )


def collection_summary(collection: BookCollection, run_state: RunState) -> CollectionSummary:
    return CollectionSummary(
        id=collection.id,
        workspace_id=collection.workspace_id,
        name=collection.name,
        created_at=collection.created_at,
        initial_cash=float(collection.initial_cash),
        book_count=len(collection.portfolios),
        run_state=run_state,
    )


def collection_detail(collection: BookCollection, run_state: RunState, books: list[BookSummary]) -> CollectionDetail:
    return CollectionDetail(
        id=collection.id,
        workspace_id=collection.workspace_id,
        name=collection.name,
        created_at=collection.created_at,
        initial_cash=float(collection.initial_cash),
        book_count=len(collection.portfolios),
        run_state=run_state,
        books=books,
    )


def book_summary(book: Portfolio, run_state: RunState) -> BookSummary:
    preview = sorted(
        [
            BookAllocationPreview(
                ticker=allocation.ticker,
                asset_type=allocation.asset_type,
                weight=float(allocation.weight),
            )
            for allocation in book.allocations
        ],
        key=lambda item: item.weight,
        reverse=True,
    )
    total_weight = sum(item.weight for item in preview)
    collection = book.collection
    return BookSummary(
        id=book.id,
        workspace_id=book.workspace_id,
        collection_id=book.collection_id,
        collection_name=collection.name if collection is not None else None,
        name=book.name,
        description=book.description,
        created_at=book.created_at,
        base_currency=book.base_currency,
        initial_cash=float(book.initial_cash),
        open_positions=sum(1 for position in book.positions if position.exit_date is None),
        total_positions=len(book.positions),
        strategy_kind=book.strategy_kind,
        preset_id=book.preset_id,
        allocation_preview=preview,
        cash_weight=max(0.0, 100 - total_weight),
        run_state=run_state,
    )


def book_config(book: Portfolio, run_state: RunState) -> BookConfig:
    collection = book.collection
    return BookConfig(
        id=book.id,
        workspace_id=book.workspace_id,
        collection_id=book.collection_id,
        collection_name=collection.name if collection is not None else None,
        name=book.name,
        description=book.description,
        strategy_kind=book.strategy_kind,
        preset_id=book.preset_id,
        allocations=[
            BookAllocationCreate(
                ticker=allocation.ticker,
                asset_type=allocation.asset_type,
                weight=allocation.weight,
            )
            for allocation in book.allocations
        ],
        run_state=run_state,
    )


def workspace_view(
    workspace: Workspace,
    eligibility: WorkspaceEligibilitySnapshot,
    eligibility_service: RunEligibilityService,
) -> WorkspaceView:
    return WorkspaceView(
        workspace=workspace_detail(workspace, eligibility.run_state),
        collections=[
            collection_detail(
                collection,
                eligibility.collection_states.get(collection.id, eligibility_service.collection_run_state(collection)),
                [
                    book_summary(book, eligibility.book_states.get(book.id, eligibility_service.book_run_state(book)))
                    for book in collection.portfolios
                ],
            )
            for collection in workspace.collections
        ],
    )
