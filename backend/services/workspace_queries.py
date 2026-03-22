from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.errors import ApiErrorException
from backend.models.db import BookCollection, Portfolio, Workspace


def workspace_load_options():
    return (
        selectinload(Workspace.collections).selectinload(BookCollection.portfolios).selectinload(Portfolio.positions),
        selectinload(Workspace.collections).selectinload(BookCollection.portfolios).selectinload(Portfolio.allocations),
    )


def load_workspace(session: Session, workspace_id: str) -> Workspace:
    workspace = session.execute(
        select(Workspace)
        .options(*workspace_load_options())
        .where(Workspace.id == workspace_id)
    ).scalars().first()
    if workspace is None:
        raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")
    return workspace


def load_collection(session: Session, collection_id: str) -> BookCollection:
    collection = session.execute(
        select(BookCollection)
        .options(
            selectinload(BookCollection.portfolios).selectinload(Portfolio.positions),
            selectinload(BookCollection.portfolios).selectinload(Portfolio.allocations),
            selectinload(BookCollection.workspace)
            .selectinload(Workspace.collections)
            .selectinload(BookCollection.portfolios)
            .selectinload(Portfolio.positions),
            selectinload(BookCollection.workspace)
            .selectinload(Workspace.collections)
            .selectinload(BookCollection.portfolios)
            .selectinload(Portfolio.allocations),
        )
        .where(BookCollection.id == collection_id)
    ).scalars().first()
    if collection is None:
        raise ApiErrorException(404, "collection_not_found", "Collection not found.")
    return collection


def load_book(session: Session, book_id: str) -> Portfolio:
    book = session.execute(
        select(Portfolio)
        .options(
            selectinload(Portfolio.positions),
            selectinload(Portfolio.allocations),
            selectinload(Portfolio.collection),
            selectinload(Portfolio.collection)
            .selectinload(BookCollection.workspace)
            .selectinload(Workspace.collections)
            .selectinload(BookCollection.portfolios)
            .selectinload(Portfolio.positions),
            selectinload(Portfolio.collection)
            .selectinload(BookCollection.workspace)
            .selectinload(Workspace.collections)
            .selectinload(BookCollection.portfolios)
            .selectinload(Portfolio.allocations),
        )
        .where(Portfolio.id == book_id)
    ).scalars().first()
    if book is None:
        raise ApiErrorException(404, "book_not_found", "Book not found.")
    return book
