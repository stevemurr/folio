from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import BookCreate, BookSummary, CollectionCreate, CollectionSummary, CollectionUpdate
from backend.services.workspace_service import WorkspaceService

router = APIRouter(tags=["collections"])


@router.post("/workspaces/{workspace_id}/collections", response_model=CollectionSummary, status_code=status.HTTP_201_CREATED)
def create_collection(
    workspace_id: str,
    payload: CollectionCreate,
    db: Session = Depends(get_db),
) -> CollectionSummary:
    return WorkspaceService(db).create_collection(workspace_id, payload)


@router.patch("/collections/{collection_id}", response_model=CollectionSummary)
def update_collection(
    collection_id: str,
    payload: CollectionUpdate,
    db: Session = Depends(get_db),
) -> CollectionSummary:
    return WorkspaceService(db).update_collection(collection_id, payload)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, db: Session = Depends(get_db)) -> Response:
    WorkspaceService(db).delete_collection(collection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/collections/{collection_id}/books", response_model=BookSummary, status_code=status.HTTP_201_CREATED)
def create_book(
    collection_id: str,
    payload: BookCreate,
    db: Session = Depends(get_db),
) -> BookSummary:
    return WorkspaceService(db).create_book(collection_id, payload)
