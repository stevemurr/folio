from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from datetime import date
from typing import Any

import httpx
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import ChatHistory
from backend.models.schemas import BookSnapshot, ChatHistoryEntry, PositionWithMetrics
from backend.services.app_config_service import get_runtime_settings
from backend.services.portfolio_engine import PortfolioEngine


ANALYSIS_PROMPT = (
    "Analyze this portfolio. Identify the top performer by risk-adjusted return, the worst drag on "
    "Sharpe ratio, any concentration risk, and give 2-3 actionable observations."
)
MAX_CONTEXT_TURNS = 50


def encode_sse_event(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


class AgentService:
    def __init__(self, session: Session):
        self.session = session
        self.settings = get_runtime_settings(session)
        self.portfolio_engine = PortfolioEngine(session)

    def ensure_enabled(self) -> None:
        if not self.settings.capabilities.agent:
            raise ApiErrorException(
                501,
                "capability_disabled",
                "Add an OpenAI-compatible endpoint to enable agent analysis.",
            )

    def list_history(self, portfolio_id: str) -> list[ChatHistoryEntry]:
        self.ensure_enabled()
        self.portfolio_engine.get_portfolio(portfolio_id)
        history = self.session.execute(
            select(ChatHistory)
            .where(ChatHistory.portfolio_id == portfolio_id)
            .order_by(ChatHistory.created_at.asc(), ChatHistory.id.asc())
        ).scalars().all()
        return [self._to_history_entry(item) for item in history]

    def clear_history(self, portfolio_id: str) -> None:
        self.ensure_enabled()
        self.portfolio_engine.get_portfolio(portfolio_id)
        self.session.execute(delete(ChatHistory).where(ChatHistory.portfolio_id == portfolio_id))
        self.session.commit()

    def build_analysis_messages(self, portfolio_id: str) -> list[dict[str, str]]:
        return self._build_messages(portfolio_id, ANALYSIS_PROMPT)

    def build_chat_messages(self, portfolio_id: str, content: str) -> list[dict[str, str]]:
        message = content.strip()
        if not message:
            raise ApiErrorException(400, "invalid_chat_message", "Message content is required.")
        return self._build_messages(portfolio_id, message)

    def save_chat_turn(self, portfolio_id: str, user_content: str, assistant_content: str) -> ChatHistoryEntry:
        user_message = user_content.strip()
        assistant_message = assistant_content.strip()
        if not user_message:
            raise ApiErrorException(400, "invalid_chat_message", "Message content is required.")
        if not assistant_message:
            raise ApiErrorException(502, "agent_empty_response", "The configured agent returned no content.")

        self.portfolio_engine.get_portfolio(portfolio_id)
        user_entry = ChatHistory(portfolio_id=portfolio_id, role="user", content=user_message)
        assistant_entry = ChatHistory(portfolio_id=portfolio_id, role="assistant", content=assistant_message)
        self.session.add_all([user_entry, assistant_entry])
        self.session.commit()
        self.session.refresh(assistant_entry)
        return self._to_history_entry(assistant_entry)

    async def stream_completion(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        self.ensure_enabled()
        headers = {"Content-Type": "application/json"}
        api_key = self.settings.agent.api_key.strip()
        if api_key and api_key.lower() != "none":
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {
            "model": self.settings.agent.model,
            "messages": list(messages),
            "temperature": self.settings.agent.temperature,
            "max_tokens": self.settings.agent.max_tokens,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None)) as client:
                async with client.stream(
                    "POST",
                    f"{self.settings.agent.endpoint.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        raise ApiErrorException(
                            502,
                            "agent_upstream_error",
                            self._extract_error_message(await response.aread(), response.reason_phrase),
                        )

                    content_type = response.headers.get("content-type", "").lower()
                    if "text/event-stream" not in content_type:
                        content = self._extract_completion_content(await response.aread())
                        if content:
                            yield content
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw_event = line[5:].strip()
                        if not raw_event:
                            continue
                        if raw_event == "[DONE]":
                            break
                        try:
                            event = json.loads(raw_event)
                        except json.JSONDecodeError:
                            continue
                        delta = self._extract_stream_delta(event)
                        if delta:
                            yield delta
        except ApiErrorException:
            raise
        except httpx.HTTPError as exc:
            raise ApiErrorException(
                502,
                "agent_upstream_unreachable",
                f"Unable to reach the configured agent endpoint: {exc}",
            ) from exc

    def _build_messages(self, portfolio_id: str, user_content: str) -> list[dict[str, str]]:
        self.ensure_enabled()
        portfolio = self.portfolio_engine.build_portfolio_detail(portfolio_id)
        history = self.session.execute(
            select(ChatHistory)
            .where(ChatHistory.portfolio_id == portfolio_id)
            .order_by(desc(ChatHistory.created_at), desc(ChatHistory.id))
            .limit(MAX_CONTEXT_TURNS * 2)
        ).scalars().all()
        history.reverse()
        messages = [{"role": "system", "content": self._build_system_prompt(portfolio)}]
        messages.extend(
            {"role": item.role, "content": item.content}
            for item in history
            if item.role in {"user", "assistant"} and item.content.strip()
        )
        messages.append({"role": "user", "content": user_content})
        return messages

    def _build_system_prompt(self, portfolio: BookSnapshot) -> str:
        metrics = portfolio.metrics
        positions = sorted(portfolio.positions, key=lambda item: item.current_value, reverse=True)
        positions_block = "\n".join(self._format_position(position) for position in positions) or "None"

        allocation_lines = [
            f"- {position.ticker}: {self._format_currency(position.current_value)} ({position.weight * 100:.2f}%)"
            for position in positions
            if position.status == "open"
        ]
        if metrics.total_value > 0 and metrics.current_cash > 0:
            allocation_lines.append(
                f"- CASH: {self._format_currency(metrics.current_cash)} "
                f"({(metrics.current_cash / metrics.total_value) * 100:.2f}%)"
            )
        allocation_block = "\n".join(allocation_lines) or "None"

        return (
            "You are a financial analysis assistant for a personal investment simulator. "
            "All investments are virtual/simulated. Provide analysis grounded in the supplied data, "
            "and do not claim to execute trades.\n"
            f"Today's date: {date.today().isoformat()}\n"
            f"Risk-free rate: {metrics.risk_free_rate:.2f}%\n\n"
            f"PORTFOLIO: {portfolio.name}\n"
            f"Description: {portfolio.description or 'No description provided.'}\n"
            f"Total Value: {self._format_currency(metrics.total_value)} | "
            f"Cash: {self._format_currency(metrics.current_cash)}\n"
            f"Simple ROI: {self._format_percent(metrics.simple_roi)} | "
            f"Annualized Return: {self._format_percent(metrics.annualized_return)}\n"
            f"Sharpe Ratio: {self._format_number(metrics.sharpe_ratio)} | "
            f"Alpha vs {metrics.benchmark_ticker}: {self._format_percent(metrics.alpha)} | "
            f"Beta: {self._format_number(metrics.beta)}\n"
            f"Benchmark Return ({metrics.benchmark_ticker}): {self._format_percent(metrics.benchmark_return)}\n\n"
            f"CURRENT ALLOCATION:\n{allocation_block}\n\n"
            f"POSITIONS:\n{positions_block}"
        )

    def _format_position(self, position: PositionWithMetrics) -> str:
        status = "Open" if position.status == "open" else f"Closed on {position.exit_date}"
        return (
            f"- {position.ticker} | {position.asset_type} | {position.shares:.4f} shares | "
            f"Entry: {self._format_currency(position.entry_price)} on {position.entry_date.isoformat()} | "
            f"Current: {self._format_currency(position.current_price)} | "
            f"ROI: {self._format_percent(position.simple_roi)} | "
            f"Annualized: {self._format_percent(position.annualized_return)} | "
            f"Sharpe: {self._format_number(position.sharpe_ratio)} | "
            f"P&L: {self._format_currency(position.dollar_pnl)} | Status: {status}"
        )

    def _extract_stream_delta(self, payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""
        choice = choices[0]
        if not isinstance(choice, dict):
            return ""
        delta = choice.get("delta")
        if isinstance(delta, dict):
            return self._coerce_content(delta.get("content"))
        return ""

    def _extract_completion_content(self, raw_body: bytes) -> str:
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw_body.decode("utf-8", errors="ignore").strip()

        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""
        choice = choices[0]
        if not isinstance(choice, dict):
            return ""

        message = choice.get("message")
        if isinstance(message, dict):
            return self._coerce_content(message.get("content"))

        delta = choice.get("delta")
        if isinstance(delta, dict):
            return self._coerce_content(delta.get("content"))
        return ""

    def _extract_error_message(self, raw_body: bytes, fallback: str | None) -> str:
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            text = raw_body.decode("utf-8", errors="ignore").strip()
            return text or fallback or "The configured agent endpoint returned an error."

        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message

        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail
        return fallback or "The configured agent endpoint returned an error."

    def _coerce_content(self, value: object) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            parts = [
                item.get("text", "")
                for item in value
                if isinstance(item, dict) and isinstance(item.get("text"), str)
            ]
            return "".join(parts)
        return ""

    def _to_history_entry(self, item: ChatHistory) -> ChatHistoryEntry:
        return ChatHistoryEntry(
            id=item.id,
            portfolio_id=item.portfolio_id,
            role=item.role,
            content=item.content,
            created_at=item.created_at,
        )

    def _format_currency(self, value: float | None) -> str:
        if value is None:
            return "n/a"
        return f"${value:,.2f}"

    def _format_percent(self, value: float | None) -> str:
        if value is None:
            return "n/a"
        return f"{value * 100:.2f}%"

    def _format_number(self, value: float | None) -> str:
        if value is None:
            return "n/a"
        return f"{value:.2f}"
