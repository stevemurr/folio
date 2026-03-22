from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import BookCollection, Portfolio, Workspace
from backend.models.schemas import (
    BookAllocationCreate,
    RunState,
    RunStateIssue,
    WorkspaceAvailabilityResponse,
    WorkspaceTickerAvailability,
)
from backend.services.app_config_service import get_runtime_settings
from backend.services.market_data import MarketDataService, ResolvedPrice


@dataclass
class CollectionEligibilitySnapshot:
    run_state: RunState
    book_states: dict[str, RunState]


@dataclass
class WorkspaceEligibilitySnapshot:
    opening_session: date | None
    opening_issues: list[RunStateIssue]
    collection_states: dict[str, RunState]
    book_states: dict[str, RunState]
    run_state: RunState


class RunEligibilityService:
    def __init__(self, session: Session):
        self.session = session
        self.market_data = MarketDataService(session)
        self.settings = get_runtime_settings(session)
        self._opening_session_cache: dict[date, tuple[date | None, list[RunStateIssue]]] = {}
        self._availability_cache: dict[tuple[date, tuple[str, ...]], dict[str, ResolvedPrice | None]] = {}

    def workspace_run_state(self, workspace: Workspace) -> RunState:
        return self.inspect_workspace(workspace).run_state

    def collection_run_state(self, collection: BookCollection) -> RunState:
        workspace = collection.workspace
        if workspace is None:
            return RunState(
                status="blocked",
                opening_session=None,
                issues=[RunStateIssue(code="workspace_missing", message="This collection is not attached to a workspace.")],
            )
        return self.inspect_workspace(workspace).collection_states.get(
            collection.id,
            RunState(
                status="blocked",
                opening_session=None,
                issues=[RunStateIssue(code="collection_missing", message="Collection eligibility could not be resolved.")],
            ),
        )

    def book_run_state(self, book: Portfolio) -> RunState:
        workspace = self._workspace_for_book(book)
        if workspace is None:
            return RunState(
                status="blocked",
                opening_session=None,
                issues=[RunStateIssue(code="workspace_missing", message="This book is not attached to a workspace.")],
            )
        return self.inspect_workspace(workspace).book_states.get(
            book.id,
            RunState(
                status="blocked",
                opening_session=None,
                issues=[RunStateIssue(code="book_missing", message="Book eligibility could not be resolved.")],
            ),
        )

    def workspace_availability(self, workspace: Workspace, tickers: list[str]) -> WorkspaceAvailabilityResponse:
        opening_session, issues = self._opening_session(workspace.start_date)
        target_date = opening_session or workspace.start_date
        availability = self._availability(target_date, tickers)
        return WorkspaceAvailabilityResponse(
            workspace_id=workspace.id,
            opening_session=opening_session,
            issues=[issue.model_copy(deep=True) for issue in issues],
            tickers=[
                WorkspaceTickerAvailability(
                    ticker=ticker,
                    available=opening_session is not None and resolved is not None and resolved.date == opening_session,
                    first_tradable_date=resolved.date if resolved is not None else None,
                )
                for ticker, resolved in availability.items()
            ],
        )

    def validate_book_allocations(
        self,
        *,
        start_date: date,
        allocations: list[BookAllocationCreate],
    ) -> tuple[date, dict[str, ResolvedPrice]]:
        opening_session, issues = self._opening_session(start_date)
        if opening_session is None:
            raise ApiErrorException(
                422,
                "book_unavailable_for_workspace",
                self._issues_message(issues, "The workspace opening session is unavailable."),
            )

        availability = self._availability(opening_session, [allocation.ticker for allocation in allocations])
        allocation_issues = self._exact_session_issues(
            availability,
            opening_session,
            issue_code="allocation_unavailable_for_workspace",
            noun="Allocation",
        )
        if allocation_issues:
            raise ApiErrorException(
                422,
                "book_unavailable_for_workspace",
                self._issues_message(
                    allocation_issues,
                    "One or more allocations are unavailable for the shared opening session.",
                ),
            )
        return opening_session, {ticker: price for ticker, price in availability.items() if price is not None}

    def inspect_workspace(self, workspace: Workspace) -> WorkspaceEligibilitySnapshot:
        opening_session, opening_issues = self._opening_session(workspace.start_date)
        collection_states: dict[str, RunState] = {}
        book_states: dict[str, RunState] = {}
        total_books = 0
        ready_collections = 0
        blocked_collection_issues: list[RunStateIssue] = []

        for collection in workspace.collections:
            snapshot = self._inspect_collection(collection, opening_session, opening_issues)
            collection_states[collection.id] = snapshot.run_state
            book_states.update(snapshot.book_states)
            total_books += len(collection.portfolios)
            if snapshot.run_state.status == "ready":
                ready_collections += 1
            elif snapshot.run_state.status == "blocked":
                blocked_collection_issues.extend(self._prefix_issues(collection.name, snapshot.run_state.issues))

        if total_books == 0:
            workspace_status = "draft"
            workspace_issues = [issue.model_copy(deep=True) for issue in opening_issues]
        elif ready_collections > 0:
            workspace_status = "ready"
            workspace_issues = []
        else:
            workspace_status = "blocked"
            workspace_issues = [
                issue.model_copy(deep=True) for issue in opening_issues
            ] + blocked_collection_issues

        return WorkspaceEligibilitySnapshot(
            opening_session=opening_session,
            opening_issues=[issue.model_copy(deep=True) for issue in opening_issues],
            collection_states={collection_id: state.model_copy(deep=True) for collection_id, state in collection_states.items()},
            book_states={book_id: state.model_copy(deep=True) for book_id, state in book_states.items()},
            run_state=RunState(
                status=workspace_status,
                opening_session=opening_session,
                issues=workspace_issues,
            ),
        )

    def _inspect_collection(
        self,
        collection: BookCollection,
        opening_session: date | None,
        opening_issues: list[RunStateIssue],
    ) -> CollectionEligibilitySnapshot:
        if opening_session is None:
            blocked = RunState(
                status="blocked",
                opening_session=None,
                issues=[issue.model_copy(deep=True) for issue in opening_issues],
            )
            return CollectionEligibilitySnapshot(
                run_state=blocked,
                book_states={
                    book.id: blocked.model_copy(deep=True)
                    for book in collection.portfolios
                },
            )

        book_states = {
            book.id: self._book_run_state(book, opening_session)
            for book in collection.portfolios
        }
        if not collection.portfolios:
            run_state = RunState(status="draft", opening_session=opening_session, issues=[])
        else:
            blocked_issues: list[RunStateIssue] = []
            for book in collection.portfolios:
                book_state = book_states.get(book.id)
                if book_state is None or book_state.status != "blocked":
                    continue
                blocked_issues.extend(self._prefix_issues(book.name, book_state.issues))

            run_state = RunState(
                status="blocked" if blocked_issues else "ready",
                opening_session=opening_session,
                issues=blocked_issues,
            )

        return CollectionEligibilitySnapshot(
            run_state=run_state,
            book_states={book_id: state.model_copy(deep=True) for book_id, state in book_states.items()},
        )

    def _book_run_state(self, book: Portfolio, opening_session: date) -> RunState:
        allocation_tickers = [allocation.ticker for allocation in book.allocations if allocation.weight > 0]
        issues: list[RunStateIssue] = []
        if not allocation_tickers:
            issues.append(
                RunStateIssue(
                    code="book_no_allocations",
                    message="This book has no active allocations to seed at the shared opening session.",
                )
            )
        else:
            issues.extend(
                self._exact_session_issues(
                    self._availability(opening_session, allocation_tickers),
                    opening_session,
                    issue_code="allocation_unavailable_for_workspace",
                    noun="Allocation",
                )
            )

        issues.extend(self._position_alignment_issues(book, opening_session, allocation_tickers))
        return RunState(
            status="blocked" if issues else "ready",
            opening_session=opening_session,
            issues=issues,
        )

    def _position_alignment_issues(
        self,
        book: Portfolio,
        opening_session: date,
        allocation_tickers: list[str],
    ) -> list[RunStateIssue]:
        issues: list[RunStateIssue] = []
        open_positions = [position for position in book.positions if position.exit_date is None]
        open_tickers = {position.ticker for position in open_positions}
        allocation_set = set(allocation_tickers)
        if allocation_set and open_tickers != allocation_set:
            issues.append(
                RunStateIssue(
                    code="book_position_mismatch",
                    message="Saved positions do not match this book's allocation set.",
                )
            )
        for position in open_positions:
            if position.entry_date != opening_session:
                issues.append(
                    RunStateIssue(
                        code="position_entry_misaligned",
                        message=(
                            f"{position.ticker} is seeded on {position.entry_date.isoformat()}, not on the "
                            f"shared opening session {opening_session.isoformat()}."
                        ),
                        ticker=position.ticker,
                    )
                )
        return issues

    def _opening_session(self, start_date: date) -> tuple[date | None, list[RunStateIssue]]:
        cached = self._opening_session_cache.get(start_date)
        if cached is not None:
            return cached

        anchor_ticker = self.settings.market.benchmark_ticker.upper()
        resolved = self._availability(start_date, [anchor_ticker]).get(anchor_ticker)
        if resolved is None:
            issues = [
                RunStateIssue(
                    code="primary_benchmark_unavailable",
                    message=(
                        f"{anchor_ticker} has no market data on or after {start_date.isoformat()}, so the "
                        "workspace opening session cannot be determined."
                    ),
                    ticker=anchor_ticker,
                )
            ]
            result = (None, issues)
        else:
            result = (resolved.date, [])

        self._opening_session_cache[start_date] = result
        return result

    def _availability(self, target_date: date, tickers: list[str]) -> dict[str, ResolvedPrice | None]:
        normalized = tuple(sorted({ticker.strip().upper() for ticker in tickers if ticker.strip()}))
        if not normalized:
            return {}

        cache_key = (target_date, normalized)
        cached = self._availability_cache.get(cache_key)
        if cached is not None:
            return cached

        resolved = self.market_data.resolve_first_prices_on_or_after(list(normalized), target_date)
        self._availability_cache[cache_key] = resolved
        return resolved

    def _exact_session_issues(
        self,
        availability: dict[str, ResolvedPrice | None],
        opening_session: date,
        *,
        issue_code: str,
        noun: str,
    ) -> list[RunStateIssue]:
        issues: list[RunStateIssue] = []
        for ticker, resolved in availability.items():
            if resolved is None:
                issues.append(
                    RunStateIssue(
                        code=issue_code,
                        message=f"{noun} {ticker} has no market data on or after {opening_session.isoformat()}.",
                        ticker=ticker,
                    )
                )
                continue
            if resolved.date != opening_session:
                issues.append(
                    RunStateIssue(
                        code=issue_code,
                        message=(
                            f"{noun} {ticker} first becomes tradable on {resolved.date.isoformat()}, after the "
                            f"shared opening session {opening_session.isoformat()}."
                        ),
                        ticker=ticker,
                        first_tradable_date=resolved.date,
                    )
                )
        return issues

    def _workspace_for_book(self, book: Portfolio) -> Workspace | None:
        if book.collection is not None and book.collection.workspace is not None:
            return book.collection.workspace
        return book.workspace

    @staticmethod
    def _prefix_issues(owner_name: str, issues: list[RunStateIssue]) -> list[RunStateIssue]:
        return [
            RunStateIssue(
                code=issue.code,
                message=f"{owner_name}: {issue.message}",
                ticker=issue.ticker,
                first_tradable_date=issue.first_tradable_date,
            )
            for issue in issues
        ]

    @staticmethod
    def _issues_message(issues: list[RunStateIssue], fallback: str) -> str:
        if not issues:
            return fallback
        return "; ".join(issue.message for issue in issues)
