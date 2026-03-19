from __future__ import annotations

from fastapi import APIRouter, WebSocket

from backend.models.schemas import AnalyzeRequest
from backend.services.agent_service import ensure_agent_enabled

router = APIRouter(tags=["agent"])


@router.post("/agent/analyze")
def analyze_portfolio(_payload: AnalyzeRequest) -> None:
    ensure_agent_enabled()


@router.websocket("/agent/chat")
async def agent_chat(_websocket: WebSocket) -> None:
    ensure_agent_enabled()
