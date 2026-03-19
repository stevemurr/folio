# Folio Progress

Last updated: 2026-03-19

## Current Status

The project is at a working Core MVP relative to `spec.md`.

Implemented:
- FastAPI backend with portfolio, position, market, analytics, bootstrap, and capability-gated agent routes
- SQLite persistence with schema creation on startup
- yfinance-backed price cache with batch history download and prior-trading-day fills
- Portfolio replay engine with strict cash validation, ROI, annualized return, Sharpe, alpha, beta, allocation, and benchmark overlay
- APScheduler weekday stock refresh job
- React + Vite frontend with portfolio creation, selection, dashboard, chart, positions table, add-position modal, and position drawer
- Capability-gated UI placeholders for agent and real estate
- Docker build and compose packaging

Verified:
- `uv run pytest backend/tests`
- `npm test`
- `npm run build`
- `docker compose build`

## Major Gaps Against `spec.md`

Not implemented yet:
- Real estate ingestion and search via Zillow, including `RE:` synthetic assets and monthly refresh
- Agent analysis/chat implementation, including SSE analysis, WebSocket chat, context injection, and persistent chat history behavior
- DuckDB support and a migration workflow beyond startup `create_all()`
- Tailwind CSS and shadcn/ui adoption from the frontend stack section of the spec

Partially implemented:
- `chat_history` and `app_config` tables exist, but agent-driven behavior around them is not wired
- Docker packaging works, but `docker-compose.yml` still uses the obsolete `version` field

## Recommended Next Steps

1. Implement Zillow metro search, `RE:` asset pricing, and monthly refresh.
2. Implement the agent service end to end with capability detection, SSE analysis, WebSocket chat, and DB-backed history.
3. Add DuckDB as an optional engine and introduce explicit migrations.
4. Decide whether to keep the current custom CSS UI or migrate to Tailwind + shadcn/ui to match the original stack decision.
