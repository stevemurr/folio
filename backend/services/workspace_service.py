from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal, ROUND_DOWN

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import BookAllocation, BookCollection, Portfolio, Position, Workspace
from backend.models.schemas import (
    BookAllocationCreate,
    BookConfig,
    BookCreate,
    BookSnapshot,
    BookSummary,
    BookUpdate,
    CollectionCreate,
    CollectionDetail,
    CollectionSummary,
    CollectionUpdate,
    RunState,
    WorkspaceAvailabilityResponse,
    WorkspaceComparison,
    WorkspaceComparisonBenchmarkSeries,
    WorkspaceComparisonPoint,
    WorkspaceComparisonRequest,
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceUpdate,
    WorkspaceView,
)
from backend.services.portfolio_engine import PortfolioEngine
from backend.services.run_eligibility import RunEligibilityService, WorkspaceEligibilitySnapshot
from backend.services.workspace_allocations import book_allocation_inputs, normalize_book_allocations
from backend.services.workspace_comparison import (
    benchmark_overlay_values,
    benchmark_series,
    empty_comparison,
    resolve_comparison_request,
)
from backend.services.workspace_presenters import (
    book_config,
    book_summary,
    collection_summary,
    format_workspace_name,
    workspace_detail,
    workspace_summary,
    workspace_view,
)
from backend.services.workspace_queries import load_book, load_collection, load_workspace, workspace_load_options


DEFAULT_WORKSPACE_INITIAL_CASH = Decimal("10000")
SHARE_PRECISION = Decimal("0.000001")


class WorkspaceService:
    def __init__(self, session: Session):
        self.session = session
        self.portfolio_engine = PortfolioEngine(session)
        self.eligibility = RunEligibilityService(session)

    def list_workspaces(self) -> list[WorkspaceSummary]:
        workspaces = self.session.execute(
            select(Workspace)
            .options(*workspace_load_options())
            .order_by(Workspace.created_at.desc())
        ).scalars().all()
        return [workspace_summary(workspace, self.eligibility.inspect_workspace(workspace).run_state) for workspace in workspaces]

    def create_workspace(self, payload: WorkspaceCreate) -> WorkspaceDetail:
        if payload.start_date > date.today():
            raise ApiErrorException(422, "workspace_invalid", "Workspace start date cannot be in the future.")

        workspace = Workspace(
            name=format_workspace_name(payload.start_date),
            start_date=payload.start_date,
            initial_cash=DEFAULT_WORKSPACE_INITIAL_CASH,
        )
        self.session.add(workspace)
        self.session.flush()

        self.session.add(
            BookCollection(
                workspace_id=workspace.id,
                name="Collection 1",
                initial_cash=DEFAULT_WORKSPACE_INITIAL_CASH,
            )
        )
        self.session.commit()
        refreshed = self.get_workspace(workspace.id)
        return workspace_detail(refreshed, self.eligibility.workspace_run_state(refreshed))

    def update_workspace(self, workspace_id: str, payload: WorkspaceUpdate) -> WorkspaceDetail:
        workspace = self.get_workspace(workspace_id)
        if payload.name is not None:
            cleaned_name = payload.name.strip()
            if not cleaned_name:
                raise ApiErrorException(422, "workspace_invalid", "Workspace name is required.")
            workspace.name = cleaned_name
            self.session.commit()
        refreshed = self.get_workspace(workspace.id)
        return workspace_detail(refreshed, self.eligibility.workspace_run_state(refreshed))

    def get_workspace(self, workspace_id: str) -> Workspace:
        return load_workspace(self.session, workspace_id)

    def get_collection(self, collection_id: str) -> BookCollection:
        return load_collection(self.session, collection_id)

    def get_book(self, book_id: str) -> Portfolio:
        return load_book(self.session, book_id)

    def build_workspace_detail(self, workspace_id: str) -> WorkspaceDetail:
        workspace = self.get_workspace(workspace_id)
        return workspace_detail(workspace, self.eligibility.workspace_run_state(workspace))

    def build_workspace_view(self, workspace_id: str) -> WorkspaceView:
        workspace = self.get_workspace(workspace_id)
        eligibility = self.eligibility.inspect_workspace(workspace)
        return workspace_view(workspace, eligibility, self.eligibility)

    def delete_workspace(self, workspace_id: str) -> None:
        result = self.session.execute(
            delete(Workspace)
            .where(Workspace.id == workspace_id)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:
            raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")
        self.session.commit()
        self.session.expunge_all()

    def create_collection(self, workspace_id: str, payload: CollectionCreate) -> CollectionSummary:
        workspace = self.get_workspace(workspace_id)
        collection = BookCollection(
            workspace_id=workspace.id,
            name=self._resolved_collection_name(workspace, payload.name),
            initial_cash=payload.initial_cash,
        )
        self.session.add(collection)
        self.session.commit()
        refreshed = self.get_collection(collection.id)
        return collection_summary(refreshed, self.eligibility.collection_run_state(refreshed))

    def update_collection(self, collection_id: str, payload: CollectionUpdate) -> CollectionSummary:
        collection = self.get_collection(collection_id)
        workspace = collection.workspace
        if workspace is None:
            raise ApiErrorException(409, "workspace_not_found", "Collection workspace is unavailable.")

        if payload.name is not None:
            cleaned_name = payload.name.strip()
            if not cleaned_name:
                raise ApiErrorException(422, "collection_invalid", "Collection name is required.")
            collection.name = cleaned_name

        if payload.initial_cash is not None:
            collection.initial_cash = payload.initial_cash
            for book in collection.portfolios:
                self._reseed_book(
                    book,
                    workspace,
                    collection,
                    book.name,
                    book.description,
                    book.strategy_kind,
                    book.preset_id,
                    book_allocation_inputs(book.allocations),
                )

        self.session.commit()
        refreshed = self.get_collection(collection.id)
        return collection_summary(refreshed, self.eligibility.collection_run_state(refreshed))

    def delete_collection(self, collection_id: str) -> None:
        collection = self.session.get(BookCollection, collection_id)
        if collection is None:
            raise ApiErrorException(404, "collection_not_found", "Collection not found.")
        self.session.delete(collection)
        self.session.commit()

    def list_books(self, workspace_id: str) -> list[BookSummary]:
        workspace = self.get_workspace(workspace_id)
        eligibility = self.eligibility.inspect_workspace(workspace)
        return [
            book_summary(book, eligibility.book_states.get(book.id, self.eligibility.book_run_state(book)))
            for collection in workspace.collections
            for book in collection.portfolios
        ]

    def get_book_config(self, book_id: str) -> BookConfig:
        book = self.get_book(book_id)
        return book_config(book, self.eligibility.book_run_state(book))

    def create_book(self, collection_id: str, payload: BookCreate) -> BookSummary:
        collection = self.get_collection(collection_id)
        workspace = collection.workspace
        if workspace is None:
            raise ApiErrorException(409, "workspace_not_found", "Collection workspace is unavailable.")

        book = Portfolio(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            collection_id=collection.id,
            name="",
            description="",
            initial_cash=collection.initial_cash,
            strategy_kind="custom",
        )
        self._reseed_book(
            book,
            workspace,
            collection,
            payload.name,
            payload.description,
            payload.strategy_kind,
            payload.preset_id,
            payload.allocations,
        )

        self.session.add(book)
        self.session.commit()
        created = self.get_book(book.id)
        return book_summary(created, self.eligibility.book_run_state(created))

    def update_book(self, book_id: str, payload: BookUpdate) -> BookSummary:
        book = self.get_book(book_id)
        collection = self._book_collection(book)
        workspace = self._book_workspace(book)
        self._reseed_book(
            book,
            workspace,
            collection,
            payload.name,
            payload.description,
            payload.strategy_kind,
            payload.preset_id,
            payload.allocations,
        )
        self.session.commit()
        updated_book = self.get_book(book_id)
        return book_summary(updated_book, self.eligibility.book_run_state(updated_book))

    def delete_book(self, book_id: str) -> None:
        book = self.session.get(Portfolio, book_id)
        if book is None:
            raise ApiErrorException(404, "book_not_found", "Book not found.")
        self.session.delete(book)
        self.session.commit()

    def build_comparison(self, workspace_id: str, payload: WorkspaceComparisonRequest) -> WorkspaceComparison:
        workspace = self.get_workspace(workspace_id)
        eligibility = self.eligibility.inspect_workspace(workspace)
        benchmark_tickers, primary_ticker = resolve_comparison_request(
            payload,
            self.portfolio_engine.settings.market.benchmark_ticker.upper(),
        )
        ready_collections = [
            collection
            for collection in workspace.collections
            if eligibility.collection_states.get(collection.id, RunState(status="draft", issues=[])).status == "ready"
        ]
        benchmark_items = benchmark_series(ready_collections, benchmark_tickers, primary_ticker)
        opening_session = eligibility.opening_session

        books = [book for collection in ready_collections for book in collection.portfolios]
        if opening_session is None or not books:
            return empty_comparison(
                workspace=workspace,
                opening_session=opening_session,
                primary_benchmark_ticker=primary_ticker,
                benchmark_tickers=benchmark_tickers,
                benchmark_items=benchmark_items,
            )

        tracked_tickers = sorted(
            {position.ticker for book in books for position in book.positions if position.exit_date is None}
            | set(benchmark_tickers)
        )
        if not tracked_tickers:
            return empty_comparison(
                workspace=workspace,
                opening_session=opening_session,
                primary_benchmark_ticker=primary_ticker,
                benchmark_tickers=benchmark_tickers,
                benchmark_items=benchmark_items,
            )

        shared_frame = self.portfolio_engine.market_data.load_price_frame(tracked_tickers, opening_session, date.today())
        analyses = self.portfolio_engine.analyze_portfolios(
            books,
            start_date=opening_session,
            primary_benchmark_ticker=self.portfolio_engine.settings.market.benchmark_ticker.upper(),
            benchmark_tickers=benchmark_tickers,
            price_frame=shared_frame,
        )
        first_analysis = next((analysis for analysis in analyses.values() if analysis.timeseries), None)
        if first_analysis is None:
            return empty_comparison(
                workspace=workspace,
                opening_session=opening_session,
                primary_benchmark_ticker=primary_ticker,
                benchmark_tickers=benchmark_tickers,
                benchmark_items=benchmark_items,
            )

        calendar = pd.Index([pd.Timestamp(item.date) for item in first_analysis.timeseries])
        benchmark_values = benchmark_overlay_values(shared_frame, calendar, benchmark_items)
        points: list[WorkspaceComparisonPoint] = []
        for index, item in enumerate(first_analysis.timeseries):
            points.append(
                WorkspaceComparisonPoint(
                    date=item.date,
                    benchmark_values={
                        key: values[index] if index < len(values) else None
                        for key, values in benchmark_values.items()
                    },
                    book_values={
                        book_id: analyses[book_id].timeseries[index].book_value
                        for book_id in analyses
                    },
                )
            )

        return WorkspaceComparison(
            workspace_id=workspace.id,
            primary_benchmark_ticker=primary_ticker,
            benchmark_tickers=benchmark_tickers,
            benchmark_series=benchmark_items,
            start_date=points[0].date,
            end_date=points[-1].date,
            points=points,
        )

    def build_book_snapshot(
        self,
        book_id: str,
        as_of: date | None = None,
        benchmark_ticker: str | None = None,
    ) -> BookSnapshot:
        book = self.get_book(book_id)
        run_state = self.eligibility.book_run_state(book)
        if run_state.status == "blocked":
            raise ApiErrorException(
                409,
                "book_blocked",
                self._issues_message(
                    run_state,
                    "This book cannot be replayed until it is valid for the workspace opening session.",
                ),
            )
        workspace = self._book_workspace(book)
        return self.portfolio_engine.build_portfolio_detail(
            book.id,
            as_of=as_of,
            start_date=workspace.start_date,
            benchmark_ticker=benchmark_ticker,
        )

    def build_workspace_availability(
        self,
        workspace_id: str,
        tickers: list[str],
    ) -> WorkspaceAvailabilityResponse:
        workspace = self.get_workspace(workspace_id)
        return self.eligibility.workspace_availability(workspace, tickers)

    def _reseed_book(
        self,
        book: Portfolio,
        workspace: Workspace,
        collection: BookCollection,
        name: str,
        description: str,
        strategy_kind: str,
        preset_id: str | None,
        allocations: list[BookAllocationCreate],
    ) -> None:
        cleaned_name = name.strip()
        if not cleaned_name:
            raise ApiErrorException(422, "book_invalid", "Book name is required.")

        cleaned_description = description.strip()
        normalized_kind = (strategy_kind or "custom").strip().lower()
        if normalized_kind not in {"preset", "custom"}:
            raise ApiErrorException(422, "book_invalid", "Book strategy kind must be preset or custom.")
        normalized_preset = preset_id.strip() if preset_id else None
        if normalized_kind == "preset" and not normalized_preset:
            raise ApiErrorException(422, "book_invalid", "Preset books must include a preset identifier.")
        if normalized_kind == "custom":
            normalized_preset = None

        normalized_allocations = normalize_book_allocations(allocations)
        opening_session, resolved_prices = self.eligibility.validate_book_allocations(
            start_date=workspace.start_date,
            allocations=normalized_allocations,
        )

        allocation_rows: list[BookAllocation] = []
        position_rows: list[Position] = []
        for index, allocation in enumerate(normalized_allocations):
            resolved = resolved_prices[allocation.ticker]
            capital = collection.initial_cash * allocation.weight / Decimal("100")
            shares = (capital / resolved.close).quantize(SHARE_PRECISION, rounding=ROUND_DOWN)
            if shares <= 0:
                raise ApiErrorException(
                    422,
                    "book_invalid",
                    f"Allocation for {resolved.ticker} is too small to buy any shares.",
                )

            allocation_rows.append(
                BookAllocation(
                    portfolio_id=book.id,
                    asset_type=allocation.asset_type,
                    ticker=resolved.ticker,
                    weight=allocation.weight,
                    sort_order=index,
                )
            )
            position_rows.append(
                Position(
                    portfolio_id=book.id,
                    asset_type=allocation.asset_type,
                    ticker=resolved.ticker,
                    shares=shares,
                    entry_price=resolved.close,
                    entry_date=opening_session,
                    notes="",
                )
            )

        book.workspace_id = workspace.id
        book.collection_id = collection.id
        book.name = cleaned_name
        book.description = cleaned_description
        book.initial_cash = collection.initial_cash
        book.strategy_kind = normalized_kind
        book.preset_id = normalized_preset
        self.portfolio_engine.assert_cash_valid(book, position_rows)
        book.allocations = allocation_rows
        book.positions = position_rows

    def _resolved_collection_name(self, workspace: Workspace, requested_name: str | None) -> str:
        if requested_name and requested_name.strip():
            return requested_name.strip()
        return f"Collection {len(workspace.collections) + 1}"

    def _book_workspace(self, book: Portfolio) -> Workspace:
        if book.collection is not None and book.collection.workspace is not None:
            return book.collection.workspace
        workspace = book.workspace
        if workspace is None:
            raise ApiErrorException(409, "workspace_not_found", "Book workspace is unavailable.")
        return workspace

    def _book_collection(self, book: Portfolio) -> BookCollection:
        collection = book.collection
        if collection is None:
            raise ApiErrorException(409, "collection_not_found", "Book collection is unavailable.")
        return collection

    @staticmethod
    def _issues_message(run_state: RunState, fallback: str) -> str:
        if not run_state.issues:
            return fallback
        return "; ".join(issue.message for issue in run_state.issues)
