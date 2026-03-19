from __future__ import annotations

from backend.errors import ApiErrorException


def ensure_agent_enabled() -> None:
    raise ApiErrorException(501, "capability_disabled", "Agent support is disabled in the MVP.")

