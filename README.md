# Folio

Folio is a self-hosted personal investment simulator. It ships a FastAPI backend, a React dashboard styled with Tailwind and shadcn-style component primitives, SQLite persistence with revision-tracked migrations, optional DuckDB support, yfinance-backed stock and ETF history, Zillow-backed `RE:` real-estate assets, portfolio analytics, an OpenAI-compatible agent, and a runtime settings UI backed by `app_config`.

## Local Development

### Backend

```bash
uv run uvicorn backend.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The backend reads `~/.folio/config.yaml` by default. Copy [`config.yaml.example`](/Users/murr/Code/github.com/stevemurr/folio/config.yaml.example) to that path and adjust as needed.

Most runtime settings can also be edited from the in-app Settings modal and are persisted in the `app_config` table.

Run migrations explicitly with:

```bash
uv run folio-migrate upgrade
```

To inspect migration status:

```bash
uv run folio-migrate status
```

## Test

```bash
uv run pytest
cd frontend && npm test
```

## Build

```bash
cd frontend && npm run build
uv run python -m compileall backend
docker compose build
```
