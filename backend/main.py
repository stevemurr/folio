from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import init_database
from backend.errors import register_exception_handlers
from backend.routers import agent, app, books, collections, market, workspaces
from backend.scheduler import create_scheduler


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    scheduler = create_scheduler()
    app.state.scheduler = scheduler
    scheduler.start()
    try:
        yield
    finally:
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler:
            scheduler.shutdown(wait=False)


app_instance = FastAPI(title="Folio", version="0.1.0", lifespan=lifespan)
app_instance.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app_instance)
app_instance.include_router(app.router, prefix="/api/v1")
app_instance.include_router(workspaces.router, prefix="/api/v1")
app_instance.include_router(collections.router, prefix="/api/v1")
app_instance.include_router(books.router, prefix="/api/v1")
app_instance.include_router(market.router, prefix="/api/v1")
app_instance.include_router(agent.router, prefix="/api/v1")


if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app_instance.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app_instance.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        target = frontend_dist / full_path
        if full_path and target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(frontend_dist / "index.html")


app = app_instance
