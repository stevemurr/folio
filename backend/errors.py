from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse


class ApiErrorException(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiErrorException)
    async def _handle_api_error(_request, exc: ApiErrorException) -> JSONResponse:  # type: ignore[no-untyped-def]
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": {"code": exc.code, "message": exc.message}},
        )

