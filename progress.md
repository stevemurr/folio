# Folio Progress

Last updated: 2026-03-19

## Current Status

The project is at a working stock/ETF Core MVP with the agent phase now implemented relative to the updated, stock-first `spec.md`.

Implemented:
- FastAPI backend with portfolio, position, market, analytics, bootstrap, and capability-gated agent routes
- SQLite persistence with schema creation on startup
- yfinance-backed price cache with batch history download and prior-trading-day fills
- Portfolio replay engine with strict cash validation, ROI, annualized return, Sharpe, alpha, beta, allocation, and benchmark overlay
- APScheduler weekday stock refresh job
- OpenAI-compatible agent service with portfolio context injection, SSE analysis streaming, WebSocket chat, DB-backed chat history, and clear-history endpoints
- React + Vite frontend with portfolio creation, selection, dashboard, chart, positions table, add-position modal, position drawer, agent sidebar chat, and analysis modal
- Deferred real estate placeholders
- Docker build and compose packaging

Verified:
- `uv run pytest backend/tests`
- `npm test`
- `npm run build`
- `docker compose build`

## Major Gaps Against `spec.md`

Not implemented yet:
- DuckDB support and a migration workflow beyond startup `create_all()`
- Tailwind CSS and shadcn/ui adoption from the frontend stack section of the spec

Deferred until after the stock-first release:
- Real estate ingestion and search via Zillow, including `RE:` synthetic assets and monthly refresh

Partially implemented:
- Docker packaging works, but `docker-compose.yml` still uses the obsolete `version` field
- `app_config` exists, but no user-facing configuration editing flow is wired around it

## Recommended Next Steps

1. Add DuckDB as an optional engine and introduce explicit migrations.
2. Decide whether to keep the current custom CSS UI or migrate to Tailwind + shadcn/ui to match the original stack decision.
3. Remove the obsolete `version` field from `docker-compose.yml`.
4. After the stock-first release is stable, implement Zillow metro search, `RE:` asset pricing, and monthly refresh.
