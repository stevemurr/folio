from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from backend.database import get_db, get_session_factory
from backend.models.schemas import (
    SimulationAgentDetail,
    SimulationCreate,
    SimulationResults,
    SimulationSummary,
)
from backend.services.simulation_service import SimulationService

router = APIRouter(tags=["simulations"])


def _run_simulation_background(simulation_id: str) -> None:
    """Run simulation in a background task with its own DB session."""
    session = get_session_factory()()
    try:
        SimulationService(session).run_simulation(simulation_id)
    finally:
        session.close()


@router.post(
    "/workspaces/{workspace_id}/simulations",
    response_model=SimulationSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_simulation(
    workspace_id: str,
    payload: SimulationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SimulationSummary:
    summary = SimulationService(db).create_simulation(workspace_id, payload)
    background_tasks.add_task(_run_simulation_background, summary.id)
    return summary


@router.get("/workspaces/{workspace_id}/simulations", response_model=list[SimulationSummary])
def list_simulations(
    workspace_id: str,
    db: Session = Depends(get_db),
) -> list[SimulationSummary]:
    return SimulationService(db).list_simulations(workspace_id)


@router.get("/simulations/{simulation_id}", response_model=SimulationSummary)
def get_simulation(
    simulation_id: str,
    db: Session = Depends(get_db),
) -> SimulationSummary:
    return SimulationService(db).get_simulation(simulation_id)


@router.get("/simulations/{simulation_id}/results", response_model=SimulationResults)
def get_simulation_results(
    simulation_id: str,
    db: Session = Depends(get_db),
) -> SimulationResults:
    return SimulationService(db).get_simulation_results(simulation_id)


@router.get(
    "/simulations/{simulation_id}/agents/{agent_id}",
    response_model=SimulationAgentDetail,
)
def get_simulation_agent(
    simulation_id: str,
    agent_id: str,
    db: Session = Depends(get_db),
) -> SimulationAgentDetail:
    return SimulationService(db).get_agent_detail(simulation_id, agent_id)


@router.delete("/simulations/{simulation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_simulation(
    simulation_id: str,
    db: Session = Depends(get_db),
) -> Response:
    SimulationService(db).delete_simulation(simulation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
