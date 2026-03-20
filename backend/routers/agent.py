from __future__ import annotations

from fastapi import APIRouter, Depends, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import get_db, get_session_factory
from backend.errors import ApiErrorException
from backend.models.schemas import AnalyzeRequest, ChatHistoryEntry
from backend.services.agent_service import AgentService, encode_sse_event

router = APIRouter(tags=["agent"])


@router.post("/agent/analyze")
async def analyze_portfolio(payload: AnalyzeRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    service = AgentService(db)
    messages = service.build_analysis_messages(payload.portfolio_id)

    async def event_stream():
        chunks: list[str] = []
        try:
            async for delta in service.stream_completion(messages):
                chunks.append(delta)
                yield encode_sse_event("message", {"delta": delta})
        except ApiErrorException as exc:
            yield encode_sse_event("error", {"code": exc.code, "message": exc.message})
            return

        if not chunks:
            yield encode_sse_event(
                "error",
                {"code": "agent_empty_response", "message": "The configured agent returned no content."},
            )
            return

        yield encode_sse_event("done", {"message": "".join(chunks)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/agent/history/{portfolio_id}", response_model=list[ChatHistoryEntry])
def list_history(portfolio_id: str, db: Session = Depends(get_db)) -> list[ChatHistoryEntry]:
    return AgentService(db).list_history(portfolio_id)


@router.delete("/agent/history/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(portfolio_id: str, db: Session = Depends(get_db)) -> Response:
    AgentService(db).clear_history(portfolio_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.websocket("/agent/chat")
async def agent_chat(websocket: WebSocket, portfolio_id: str) -> None:
    await websocket.accept()
    session = get_session_factory()()
    service = AgentService(session)
    try:
        service.ensure_enabled()
        service.portfolio_engine.get_portfolio(portfolio_id)
        await websocket.send_json({"type": "ready", "portfolio_id": portfolio_id})

        while True:
            payload = await websocket.receive_json()
            message_type = str(payload.get("type", "")).strip()

            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if message_type != "message":
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": {
                            "code": "invalid_message",
                            "message": "Unsupported websocket message type.",
                        },
                    }
                )
                continue

            content = str(payload.get("content", "")).strip()
            if not content:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": {
                            "code": "invalid_chat_message",
                            "message": "Message content is required.",
                        },
                    }
                )
                continue

            messages = service.build_chat_messages(portfolio_id, content)
            chunks: list[str] = []
            await websocket.send_json({"type": "assistant_start"})

            try:
                async for delta in service.stream_completion(messages):
                    chunks.append(delta)
                    await websocket.send_json({"type": "assistant_delta", "delta": delta})
            except ApiErrorException as exc:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": {"code": exc.code, "message": exc.message},
                    }
                )
                continue

            if not chunks:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": {
                            "code": "agent_empty_response",
                            "message": "The configured agent returned no content.",
                        },
                    }
                )
                continue

            assistant_message = service.save_chat_turn(portfolio_id, content, "".join(chunks))
            await websocket.send_json(
                {"type": "assistant_message", "message": assistant_message.model_dump(mode="json")}
            )
    except WebSocketDisconnect:
        return
    except ApiErrorException as exc:
        await websocket.send_json({"type": "error", "detail": {"code": exc.code, "message": exc.message}})
    finally:
        session.close()
