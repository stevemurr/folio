from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import BookConfig, BookSnapshot, BookSummary, BookUpdate
from backend.services.workspace_service import WorkspaceService

router = APIRouter(tags=["books"])


@router.get("/books/{book_id}/snapshot", response_model=BookSnapshot)
def get_book_snapshot(
    book_id: str,
    as_of: date | None = Query(default=None),
    benchmark_ticker: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> BookSnapshot:
    return WorkspaceService(db).build_book_snapshot(book_id, as_of=as_of, benchmark_ticker=benchmark_ticker)


@router.get("/books/{book_id}/config", response_model=BookConfig)
def get_book_config(book_id: str, db: Session = Depends(get_db)) -> BookConfig:
    return WorkspaceService(db).get_book_config(book_id)


@router.patch("/books/{book_id}", response_model=BookSummary)
def update_book(book_id: str, payload: BookUpdate, db: Session = Depends(get_db)) -> BookSummary:
    return WorkspaceService(db).update_book(book_id, payload)


@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: str, db: Session = Depends(get_db)) -> Response:
    WorkspaceService(db).delete_book(book_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
