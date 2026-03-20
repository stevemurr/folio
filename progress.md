# Folio Progress

Last updated: 2026-03-19

## Current Status

The project now implements the full roadmap described in `spec.md`, including the deferred real-estate work and a user-facing runtime settings flow backed by `app_config`.

Implemented:
- FastAPI backend with portfolio, position, market, analytics, bootstrap, and capability-gated agent routes
- SQLite or DuckDB persistence with revision-tracked startup migrations and a migration CLI
- yfinance-backed price cache with batch history download and prior-trading-day fills
- Zillow-backed metro/ZIP catalog ingestion, `RE:` synthetic assets, monthly price cache support, and monthly refresh scheduling
- Portfolio replay engine with strict cash validation, ROI, annualized return, Sharpe, alpha, beta, allocation, and benchmark overlay
- APScheduler weekday stock refresh job
- OpenAI-compatible agent service with portfolio context injection, SSE analysis streaming, WebSocket chat, DB-backed chat history, and clear-history endpoints
- Runtime settings overrides via `app_config`, plus read/update settings APIs with scheduler reload support
- React + Vite frontend with Tailwind styling, shadcn-style component primitives, portfolio creation, selection, dashboard, chart, positions table, add-position modal, position drawer, agent sidebar chat, analysis modal, real-estate entry flow, and a settings modal
- Docker build and compose packaging

Verified:
- `uv run pytest backend/tests`
- `npm test`
- `npm run build`

Environment note:
- `docker compose build` is not currently verified in this workspace because the local Docker daemon is unavailable

## Major Gaps Against `spec.md`

No major functional gaps remain against the current `spec.md` scope.

## Recommended Next Steps

1. Add a Vite dev proxy or configurable frontend API base URL so split frontend/backend local dev is smoother.
2. Reduce the frontend production bundle size with code splitting around modal-heavy UI and chart surfaces.
