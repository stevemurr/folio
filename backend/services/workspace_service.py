from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal, ROUND_DOWN

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.errors import ApiErrorException
from backend.models.db import BookAllocation, Portfolio, Position, Workspace, WorkspaceBenchmark
from backend.models.schemas import (
    BookAllocationCreate,
    BookAllocationPreview,
    BookConfig,
    BookCreate,
    BookCreateResult,
    BookSummary,
    BookUpdate,
    WorkspaceBenchmark as WorkspaceBenchmarkSchema,
    WorkspaceComparison,
    WorkspaceComparisonPoint,
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceUpdate,
    WorkspaceView,
)
from backend.services.market_data import MarketDataService
from backend.services.portfolio_engine import PortfolioEngine


DEFAULT_WORKSPACE_INITIAL_CASH = Decimal("10000")
SHARE_PRECISION = Decimal("0.000001")


def format_workspace_name(start_date: date) -> str:
    return start_date.strftime("%B %d, %Y")


class WorkspaceService:
    def __init__(self, session: Session):
        self.session = session
        self.market_data = MarketDataService(session)
        self.portfolio_engine = PortfolioEngine(session)

    def list_workspaces(self) -> list[WorkspaceSummary]:
        workspaces = self.session.execute(
            select(Workspace).options(selectinload(Workspace.portfolios)).order_by(Workspace.created_at.desc())
        ).scalars().all()
        return [
            WorkspaceSummary(
                id=workspace.id,
                name=workspace.name,
                start_date=workspace.start_date,
                created_at=workspace.created_at,
                book_count=len(workspace.portfolios),
            )
            for workspace in workspaces
        ]

    def create_workspace(self, payload: WorkspaceCreate) -> WorkspaceView:
        if payload.start_date > date.today():
            raise ApiErrorException(422, "workspace_invalid", "Workspace start date cannot be in the future.")

        primary_benchmark = self.portfolio_engine.settings.market.benchmark_ticker.upper()
        workspace = Workspace(
            name=format_workspace_name(payload.start_date),
            start_date=payload.start_date,
            initial_cash=DEFAULT_WORKSPACE_INITIAL_CASH,
            benchmarks=[WorkspaceBenchmark(ticker=primary_benchmark, is_primary=True)],
        )
        self.session.add(workspace)
        self.session.commit()
        workspace = self.get_workspace(workspace.id)
        return self._workspace_view(workspace)

    def update_workspace(self, workspace_id: str, payload: WorkspaceUpdate) -> WorkspaceView:
        workspace = self.get_workspace(workspace_id)

        if payload.initial_cash is not None:
            workspace.initial_cash = payload.initial_cash
            for book in workspace.portfolios:
                self._reseed_book(book, workspace, book.name, book.description, book.strategy_kind, book.preset_id, [
                    BookAllocationCreate(ticker=allocation.ticker, asset_type=allocation.asset_type, weight=allocation.weight)
                    for allocation in book.allocations
                ])

        if payload.benchmark_tickers is not None or payload.primary_benchmark_ticker is not None:
            self._apply_workspace_benchmarks(workspace, payload.benchmark_tickers, payload.primary_benchmark_ticker)

        self.session.commit()
        workspace = self.get_workspace(workspace.id)
        return self._workspace_view(workspace)

    def get_workspace(self, workspace_id: str) -> Workspace:
        workspace = self.session.execute(
            select(Workspace)
            .options(
                selectinload(Workspace.benchmarks),
                selectinload(Workspace.portfolios).selectinload(Portfolio.positions),
                selectinload(Workspace.portfolios).selectinload(Portfolio.allocations),
            )
            .where(Workspace.id == workspace_id)
        ).scalars().first()
        if workspace is None:
            raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")
        return workspace

    def get_book(self, book_id: str) -> Portfolio:
        book = self.session.execute(
            select(Portfolio)
            .options(
                selectinload(Portfolio.positions),
                selectinload(Portfolio.allocations),
                selectinload(Portfolio.workspace).selectinload(Workspace.benchmarks),
            )
            .where(Portfolio.id == book_id)
        ).scalars().first()
        if book is None:
            raise ApiErrorException(404, "book_not_found", "Book not found.")
        return book

    def build_workspace_detail(self, workspace_id: str) -> WorkspaceDetail:
        workspace = self.get_workspace(workspace_id)
        return self._workspace_detail(workspace)

    def build_workspace_view(self, workspace_id: str) -> WorkspaceView:
        workspace = self.get_workspace(workspace_id)
        return self._workspace_view(workspace)

    def delete_workspace(self, workspace_id: str) -> None:
        workspace = self.session.get(Workspace, workspace_id)
        if workspace is None:
            raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")
        self.session.delete(workspace)
        self.session.commit()

    def list_books(self, workspace_id: str) -> list[BookSummary]:
        workspace = self.get_workspace(workspace_id)
        return [self._book_summary(book) for book in workspace.portfolios]

    def get_book_config(self, book_id: str) -> BookConfig:
        book = self.get_book(book_id)
        return self._book_config(book)

    def create_book(self, workspace_id: str, payload: BookCreate) -> BookCreateResult:
        workspace = self.get_workspace(workspace_id)
        book = Portfolio(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            name="",
            description="",
            initial_cash=workspace.initial_cash,
            strategy_kind="custom",
        )
        self._reseed_book(book, workspace, payload.name, payload.description, payload.strategy_kind, payload.preset_id, payload.allocations)

        try:
            self.session.add(book)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        workspace = self.get_workspace(workspace.id)
        created_book = next(item for item in workspace.portfolios if item.id == book.id)
        summary = self._book_summary(created_book)
        snapshot = self.portfolio_engine.build_portfolio_detail(
            created_book.id,
            as_of=payload.snapshot_as_of or workspace.start_date,
            start_date=workspace.start_date,
        )
        return BookCreateResult(
            book=summary,
            workspace_view=self._workspace_view(workspace),
            snapshot=snapshot,
        )

    def update_book(self, book_id: str, payload: BookUpdate) -> BookCreateResult:
        book = self.get_book(book_id)
        workspace = book.workspace
        self._reseed_book(book, workspace, payload.name, payload.description, payload.strategy_kind, payload.preset_id, payload.allocations)
        self.session.commit()
        workspace = self.get_workspace(workspace.id)
        updated_book = next(item for item in workspace.portfolios if item.id == book_id)
        snapshot = self.portfolio_engine.build_portfolio_detail(
            updated_book.id,
            as_of=workspace.start_date,
            start_date=workspace.start_date,
        )
        return BookCreateResult(
            book=self._book_summary(updated_book),
            workspace_view=self._workspace_view(workspace),
            snapshot=snapshot,
        )

    def delete_book(self, book_id: str) -> None:
        book = self.session.get(Portfolio, book_id)
        if book is None:
            raise ApiErrorException(404, "book_not_found", "Book not found.")
        self.session.delete(book)
        self.session.commit()

    def build_comparison(self, workspace_id: str) -> WorkspaceComparison:
        workspace = self.get_workspace(workspace_id)
        return self._build_comparison(workspace)

    def _reseed_book(
        self,
        book: Portfolio,
        workspace: Workspace,
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

        normalized_allocations = self._normalize_allocations(allocations)
        resolved_prices = self.market_data.resolve_prices_on_or_after(
            [allocation.ticker for allocation in normalized_allocations],
            workspace.start_date,
        )

        allocation_rows: list[BookAllocation] = []
        position_rows: list[Position] = []
        for index, allocation in enumerate(normalized_allocations):
            resolved = resolved_prices[allocation.ticker]
            capital = workspace.initial_cash * allocation.weight / Decimal("100")
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
                    entry_date=resolved.date,
                    notes="",
                )
            )

        book.name = cleaned_name
        book.description = cleaned_description
        book.initial_cash = workspace.initial_cash
        book.strategy_kind = normalized_kind
        book.preset_id = normalized_preset
        self.portfolio_engine.assert_cash_valid(book, position_rows)
        book.allocations = allocation_rows
        book.positions = position_rows

    def _normalize_allocations(self, allocations: list[BookAllocationCreate]) -> list[BookAllocationCreate]:
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

    def _apply_workspace_benchmarks(
        self,
        workspace: Workspace,
        benchmark_tickers: list[str] | None,
        primary_benchmark_ticker: str | None,
    ) -> None:
        current_tickers = [item.ticker for item in workspace.benchmarks]
        normalized_tickers = current_tickers if benchmark_tickers is None else self._normalize_benchmark_tickers(benchmark_tickers)
        if not normalized_tickers:
            raise ApiErrorException(422, "workspace_invalid", "At least one benchmark ticker is required.")

        existing_primary = self._primary_benchmark_ticker(workspace)
        requested_primary = primary_benchmark_ticker.strip().upper() if primary_benchmark_ticker else existing_primary
        if requested_primary not in normalized_tickers:
            requested_primary = normalized_tickers[0]

        workspace.benchmarks.clear()
        self.session.flush()
        workspace.benchmarks.extend([
            WorkspaceBenchmark(
                ticker=ticker,
                is_primary=ticker == requested_primary,
            )
            for ticker in normalized_tickers
        ])

    def _normalize_benchmark_tickers(self, tickers: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for ticker in tickers:
            cleaned = ticker.strip().upper()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)
        return normalized

    def _build_comparison(self, workspace: Workspace) -> WorkspaceComparison:
        books = workspace.portfolios
        benchmark_tickers = self._benchmark_tickers(workspace)
        primary_benchmark_ticker = self._primary_benchmark_ticker(workspace)

        if not books:
            return WorkspaceComparison(
                workspace_id=workspace.id,
                primary_benchmark_ticker=primary_benchmark_ticker,
                benchmark_tickers=benchmark_tickers,
                start_date=workspace.start_date,
                end_date=workspace.start_date,
                points=[],
            )

        tracked_tickers = sorted(
            {position.ticker for book in books for position in book.positions} | set(benchmark_tickers)
        )
        shared_frame = self.market_data.load_price_frame(tracked_tickers, workspace.start_date, date.today())
        analyses = self.portfolio_engine.analyze_portfolios(
            books,
            start_date=workspace.start_date,
            primary_benchmark_ticker=primary_benchmark_ticker,
            benchmark_tickers=benchmark_tickers,
            price_frame=shared_frame,
        )

        first_analysis = next(iter(analyses.values()))
        if not first_analysis.timeseries:
            return WorkspaceComparison(
                workspace_id=workspace.id,
                primary_benchmark_ticker=primary_benchmark_ticker,
                benchmark_tickers=benchmark_tickers,
                start_date=workspace.start_date,
                end_date=workspace.start_date,
                points=[],
            )

        calendar = pd.Index([pd.Timestamp(item.date) for item in first_analysis.timeseries])
        benchmark_values = self._benchmark_overlay_values(shared_frame, calendar, benchmark_tickers, float(workspace.initial_cash))

        points: list[WorkspaceComparisonPoint] = []
        for index, item in enumerate(first_analysis.timeseries):
            points.append(
                WorkspaceComparisonPoint(
                    date=item.date,
                    benchmark_values={
                        ticker: values[index] if index < len(values) else None
                        for ticker, values in benchmark_values.items()
                    },
                    book_values={
                        book_id: analyses[book_id].timeseries[index].book_value
                        for book_id in analyses
                    },
                )
            )

        return WorkspaceComparison(
            workspace_id=workspace.id,
            primary_benchmark_ticker=primary_benchmark_ticker,
            benchmark_tickers=benchmark_tickers,
            start_date=points[0].date,
            end_date=points[-1].date,
            points=points,
        )

    def _benchmark_overlay_values(
        self,
        shared_frame: pd.DataFrame,
        calendar: pd.Index,
        benchmark_tickers: list[str],
        initial_cash: float,
    ) -> dict[str, list[float | None]]:
        reindexed_frame = shared_frame.reindex(calendar)
        for ticker in reindexed_frame.columns:
            reindexed_frame[ticker] = reindexed_frame[ticker].ffill()

        values: dict[str, list[float | None]] = {}
        for ticker in benchmark_tickers:
            if ticker not in reindexed_frame:
                values[ticker] = [None for _ in calendar]
                continue
            series = reindexed_frame[ticker]
            start = series.iloc[0]
            if pd.isna(start) or not start:
                values[ticker] = [None for _ in calendar]
                continue
            values[ticker] = [
                float((price / start) * initial_cash) if not pd.isna(price) else None
                for price in series
            ]
        return values

    def _workspace_detail(self, workspace: Workspace) -> WorkspaceDetail:
        return WorkspaceDetail(
            id=workspace.id,
            name=workspace.name,
            start_date=workspace.start_date,
            created_at=workspace.created_at,
            book_count=len(workspace.portfolios),
            initial_cash=float(workspace.initial_cash),
            benchmarks=[
                WorkspaceBenchmarkSchema(ticker=benchmark.ticker, is_primary=benchmark.is_primary)
                for benchmark in workspace.benchmarks
            ],
        )

    def _workspace_view(self, workspace: Workspace) -> WorkspaceView:
        return WorkspaceView(
            workspace=self._workspace_detail(workspace),
            books=[self._book_summary(book) for book in workspace.portfolios],
            comparison=self._build_comparison(workspace),
        )

    def _book_summary(self, book: Portfolio) -> BookSummary:
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
        return BookSummary(
            id=book.id,
            workspace_id=book.workspace_id,
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
        )

    def _book_config(self, book: Portfolio) -> BookConfig:
        return BookConfig(
            id=book.id,
            workspace_id=book.workspace_id,
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
        )

    def _benchmark_tickers(self, workspace: Workspace) -> list[str]:
        if workspace.benchmarks:
            return [item.ticker for item in workspace.benchmarks]
        return [self.portfolio_engine.settings.market.benchmark_ticker.upper()]

    def _primary_benchmark_ticker(self, workspace: Workspace) -> str:
        for benchmark in workspace.benchmarks:
            if benchmark.is_primary:
                return benchmark.ticker
        return self._benchmark_tickers(workspace)[0]
