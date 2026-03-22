from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import (
    BookSummary,
    WorkspaceAvailabilityRequest,
    WorkspaceAvailabilityResponse,
    WorkspaceComparison,
    WorkspaceComparisonRequest,
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceUpdate,
    WorkspaceView,
)
from backend.services.workspace_service import WorkspaceService

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces", response_model=list[WorkspaceSummary])
def list_workspaces(db: Session = Depends(get_db)) -> list[WorkspaceSummary]:
    return WorkspaceService(db).list_workspaces()


@router.post("/workspaces", response_model=WorkspaceDetail, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)) -> WorkspaceDetail:
    return WorkspaceService(db).create_workspace(payload)


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceDetail)
def get_workspace(workspace_id: str, db: Session = Depends(get_db)) -> WorkspaceDetail:
    return WorkspaceService(db).build_workspace_detail(workspace_id)


@router.get("/workspaces/{workspace_id}/view", response_model=WorkspaceView)
def get_workspace_view(workspace_id: str, db: Session = Depends(get_db)) -> WorkspaceView:
    return WorkspaceService(db).build_workspace_view(workspace_id)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceDetail)
def update_workspace(payload: WorkspaceUpdate, workspace_id: str, db: Session = Depends(get_db)) -> WorkspaceDetail:
    return WorkspaceService(db).update_workspace(workspace_id, payload)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(workspace_id: str, db: Session = Depends(get_db)) -> Response:
    WorkspaceService(db).delete_workspace(workspace_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/workspaces/{workspace_id}/books", response_model=list[BookSummary])
def list_books(workspace_id: str, db: Session = Depends(get_db)) -> list[BookSummary]:
    return WorkspaceService(db).list_books(workspace_id)


@router.post("/workspaces/{workspace_id}/comparison", response_model=WorkspaceComparison)
def get_workspace_comparison(
    workspace_id: str,
    payload: WorkspaceComparisonRequest,
    db: Session = Depends(get_db),
) -> WorkspaceComparison:
    return WorkspaceService(db).build_comparison(workspace_id, payload)


@router.post("/workspaces/{workspace_id}/availability", response_model=WorkspaceAvailabilityResponse)
def get_workspace_availability(
    workspace_id: str,
    payload: WorkspaceAvailabilityRequest,
    db: Session = Depends(get_db),
) -> WorkspaceAvailabilityResponse:
    return WorkspaceService(db).build_workspace_availability(workspace_id, payload.tickers)
