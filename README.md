# Folio

Folio is a self-hosted personal investment simulator. This MVP ships a FastAPI backend, a React dashboard, SQLite persistence, yfinance-backed stock and ETF history, portfolio analytics, and capability-gated placeholders for agent and real-estate features.

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

