# Folio — Open Source Personal Investment Simulator
## System Specification v1.0

---

## Overview

**Folio** is a self-hosted, open-source investment simulator that lets users build virtual portfolios backed by real-world market data. All investment results are simulated — no real money, no brokerage integration. The core purpose is to understand how investment decisions would have played out over time, with **Sharpe ratio** as the primary signal for "bang for buck."

An embedded local LLM agent (via any OpenAI-compatible endpoint) provides natural-language portfolio analysis and persistent chat-based exploration.

Current delivery plan: ship a complete stocks/ETFs experience first. Zillow-backed real-estate support remains part of the roadmap, but it is deferred until after the stock/ETF, agent, and persistence milestones are complete.

---

## Goals

- Deliver a complete paper-trading experience for US stocks/ETFs without real capital at risk
- Replay historical decisions: "What if I had bought NVDA in Jan 2022?"
- Surface risk-adjusted return (Sharpe) as the primary performance lens
- Chat with a local LLM that has full context of your portfolio data
- Stay fully self-hosted with zero required paid APIs
- Add real-estate simulation as a follow-on phase once the stock/ETF experience is stable

---

## Delivery Phases

- Phase 1 (current target): complete the stocks/ETFs product, including portfolio analytics, benchmark comparison, agent analysis/chat, packaging, and database improvements.
- Phase 2 (deferred): add Zillow ingestion, `RE:` synthetic assets, metro/ZIP search, and monthly refresh handling for real-estate data.

---

## Non-Goals

- Real brokerage connectivity or live trade execution
- Mobile-native apps (responsive web is sufficient)
- Multi-user / SaaS mode (single-user self-hosted only)
- Options, crypto, or derivatives (out of scope v1)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser UI                           │
│         (React + Vite, served by FastAPI static)            │
└────────────────────┬────────────────────────────────────────┘
                     │ REST + WebSocket
┌────────────────────▼────────────────────────────────────────┐
│                   FastAPI Backend (Python)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Portfolio   │  │  Market Data │  │   Agent Layer    │  │
│  │  Engine      │  │  Service     │  │   (LLM bridge)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼────────────────┼───────────────────┼─────────────┘
          │                │                   │
   ┌──────▼──────┐  ┌──────▼──────┐   ┌────────▼────────┐
   │  SQLite /   │  │  yfinance   │   │  Local LLM      │
   │  DuckDB     │  │ (Zillow in  │   │  (OpenAI-compat) │
   └─────────────┘  │  phase 2)   │   └─────────────────┘
                    └─────────────┘
```

### Component Breakdown

| Component | Technology | Purpose |
|---|---|---|
| Backend API | Python / FastAPI | REST endpoints, WebSocket for chat stream |
| Portfolio Engine | Python | Simulation math, Sharpe computation |
| Market Data Service | yfinance (+ Zillow in phase 2) | Price history ingestion and caching |
| Data Store | SQLite (dev) / DuckDB (prod) | Portfolios, positions, price cache, chat history |
| Frontend | React + Vite + Recharts | Dashboard, charts, chat sidebar |
| LLM Agent | OpenAI-compat HTTP client | Natural language interface over portfolio data |
| Task Scheduler | APScheduler (in-process) | Weekday stock refresh; monthly Zillow refresh in phase 2 |

---

## Data Sources

### US Stocks & ETFs — `yfinance`

- Library: `yfinance` (no API key required)
- Provides: OHLCV daily history, dividends, splits
- Ticker validation: attempt `yf.Ticker(sym).info` on creation; reject if no data
- Cache strategy: store daily closes in local DB; refresh nightly via scheduler
- Historical depth: fetch up to 10 years on first pull; incremental updates thereafter

### Real Estate — Zillow (Phase 2, deferred)

- Data available via Zillow's public ZHVI (Zillow Home Value Index) CSV downloads
  - URL: `https://www.zillow.com/research/data/`
  - Monthly metro/zip-level median home values (free, no key)
- User selects a metro area or ZIP code as their "real estate asset"
- Represented as a synthetic ticker (e.g., `RE:94105` for SF ZIP 94105)
- Refresh cadence: monthly (Zillow updates monthly)
- Limitation: aggregate index only — not individual property simulation

---

## Core Domain Model

### Portfolio

```
Portfolio
  id: uuid
  name: string
  description: string
  created_at: datetime
  base_currency: "USD"
  initial_cash: decimal       # virtual starting capital
```

### Position

```
Position
  id: uuid
  portfolio_id: uuid
  asset_type: enum("stock", "etf", "real_estate")
  ticker: string              # e.g. AAPL, QQQ, RE:10001
  shares: decimal             # fractional supported
  entry_price: decimal        # price at simulated purchase
  entry_date: date            # simulated purchase date (historical ok)
  exit_price: decimal | null
  exit_date: date | null
  notes: string
```

### PriceCache

```
PriceCache
  ticker: string
  date: date
  close: decimal
  source: enum("yfinance", "zillow")
  fetched_at: datetime
```

The schema reserves `real_estate` positions and `zillow` price sources for the deferred phase-2 extension. A stock-first release may initially exercise only the stock/ETF + `yfinance` paths.

---

## Portfolio Engine

All computation is done server-side in Python. No financial logic in the frontend.

### Return Metrics (per position and aggregate)

| Metric | Formula | Notes |
|---|---|---|
| Simple ROI | `(current - entry) / entry` | Percentage gain/loss |
| Annualized Return | `(1 + ROI)^(365/days_held) - 1` | Normalized for time |
| Dollar P&L | `(current - entry) * shares` | Absolute gain/loss |
| Weight | `position_value / portfolio_value` | Allocation % |

### Sharpe Ratio (primary "bang for buck" metric)

Computed at the **portfolio level** using daily returns vs. a risk-free rate.

```
daily_returns = daily_portfolio_value.pct_change()
excess_returns = daily_returns - (risk_free_rate / 252)
sharpe = (excess_returns.mean() / excess_returns.std()) * sqrt(252)
```

- Default risk-free rate: 10-year US Treasury yield (configurable, defaults to 4.25%)
- Minimum history required: 30 trading days
- Also computed per-position using that asset's daily returns in isolation
- Sharpe color coding: `< 0` = red, `0–1` = yellow, `1–2` = green, `> 2` = teal

### Benchmark Comparison

- Default benchmark: SPY (S&P 500 ETF)
- Stored as a synthetic position in the engine (not shown as a user position)
- Used to compute: portfolio alpha, beta, and relative Sharpe
- Benchmark ticker is user-configurable (e.g., QQQ, VTI)

### Portfolio Time-Series

- Reconstruct daily portfolio value from PriceCache for any date range
- Used for: chart rendering, Sharpe computation, benchmark overlay
- Computed on-demand and cached in DuckDB for performance

---

## API Design

Base path: `/api/v1`

### Portfolios

```
GET    /portfolios                     # list all portfolios
POST   /portfolios                     # create portfolio
GET    /portfolios/{id}                # get portfolio + computed metrics
DELETE /portfolios/{id}                # delete portfolio
```

### Positions

```
GET    /portfolios/{id}/positions      # list positions with live metrics
POST   /portfolios/{id}/positions      # add position (historical entry supported)
PATCH  /positions/{id}                 # update (close position, edit notes)
DELETE /positions/{id}                 # remove position
```

### Market Data

```
GET    /market/search?q={query}        # ticker search (yfinance)
GET    /market/price/{ticker}          # current price + 1d change
GET    /market/history/{ticker}?from=&to=  # OHLCV history
GET    /market/real-estate/metros      # phase 2: list of available Zillow metros
```

### Analytics

```
GET    /portfolios/{id}/metrics        # full Sharpe, returns, benchmark comparison
GET    /portfolios/{id}/timeseries     # daily portfolio value series
GET    /portfolios/{id}/allocation     # current allocation breakdown
```

### Agent

```
POST   /agent/analyze                  # one-shot portfolio analysis
WS     /agent/chat                     # persistent chat WebSocket
```

---

## LLM Agent Layer

### Configuration

```yaml
# config.yaml
agent:
  endpoint: "http://localhost:11434/v1"   # any OpenAI-compatible URL
  model: "llama3.2"                       # model name on that endpoint
  api_key: "none"                         # passthrough (set to "none" if not needed)
  max_tokens: 2048
  temperature: 0.3
```

### Context Injection

Every agent call injects a structured portfolio snapshot as system context:

```
System prompt:
  You are a financial analysis assistant for a personal investment simulator.
  You have access to the user's portfolio data below. All investments are virtual/simulated.
  Today's date: {date}
  Risk-free rate: {rate}%

  PORTFOLIO: {portfolio_name}
  Total Value: ${value} | Cash: ${cash}
  Sharpe Ratio: {sharpe} | Alpha vs SPY: {alpha}%
  Annualized Return: {annualized}%

  POSITIONS:
  {ticker} | {asset_type} | {shares} shares | Entry: ${entry} on {date}
  Current: ${current} | ROI: {roi}% | Annualized: {ann}% | Sharpe: {sharpe}
  ...

  BENCHMARK (SPY): {spy_return}% over same period
```

### One-Shot Analysis Mode

`POST /agent/analyze` triggers a structured analysis prompt:

> "Analyze this portfolio. Identify the top performer by risk-adjusted return, the worst drag on Sharpe ratio, any concentration risk, and give 2–3 actionable observations."

Response is streamed as server-sent events (SSE) and displayed in a modal result card.

### Chat Mode

`WS /agent/chat` opens a persistent WebSocket. Conversation history is maintained in the DB per portfolio (last 50 turns kept in context). Users can ask:

- "Why is my Sharpe so low?"
- "How would the portfolio have looked if I'd bought VTI instead of QQQ?"
- "What's dragging down my NVDA position?"
- "Compare my performance to just holding SPY"

The backend resolves portfolio context fresh on each message.

---

## Frontend

### Tech Stack

- **React 18 + Vite** — SPA, served as static files by FastAPI
- **Recharts** — portfolio timeseries chart, allocation pie, benchmark overlay
- **TanStack Query** — data fetching and cache invalidation
- **Tailwind CSS** — styling
- **shadcn/ui** — component primitives

### Views

#### 1. Dashboard (default view)

Key stats strip at top:
```
[ Total Value ]  [ Sharpe Ratio ★ ]  [ Ann. Return ]  [ vs SPY (alpha) ]  [ Cash Remaining ]
```

Below: portfolio timeseries chart with SPY benchmark overlay (toggleable).

Positions table columns:
```
Ticker | Type | Shares | Entry | Current | ROI% | Ann.% | Sharpe | Weight% | P&L
```

Sharpe column is color-coded. Table is sortable. Rows are clickable for position detail drawer.

#### 2. Add Position Modal

Fields:
- Asset type (Stock/ETF in phase 1; Real Estate added in phase 2)
- Ticker search (autocomplete via `/market/search`; Zillow metro search added in phase 2)
- Entry date (any historical date supported)
- Number of shares / units
- Optional: notes

System auto-fills entry price from historical price on that date.

#### 3. Agent Sidebar

Persistent right-side drawer (toggleable). Contains:
- Chat history (scrollable)
- Text input with send button
- "Analyze Portfolio" quick button (triggers one-shot at top)
- Clear chat button

#### 4. Position Detail Drawer

Slide-in panel on position row click:
- Price chart for that ticker (full history from entry date)
- Position-level Sharpe, ROI, annualized return
- Entry/exit info + notes
- "Close Position" button (marks exit at today's price)

---

## Data Persistence

### SQLite (default, zero-config)

Single file: `~/.folio/folio.db`

Tables:
- `portfolios`
- `positions`
- `price_cache`
- `chat_history`
- `app_config` (k/v store for settings)

### DuckDB (optional, recommended for larger history)

Drop-in swap via config flag. Better for analytical queries over large price history tables. Same schema.

```yaml
# config.yaml
database:
  engine: "sqlite"     # or "duckdb"
  path: "~/.folio/folio.db"
```

---

## Configuration

Single file: `~/.folio/config.yaml`

```yaml
database:
  engine: "sqlite"
  path: "~/.folio/folio.db"

agent:
  endpoint: "http://localhost:11434/v1"
  model: "llama3.2"
  api_key: "none"
  max_tokens: 2048
  temperature: 0.3

market:
  risk_free_rate: 4.25          # percent, used in Sharpe calculation
  benchmark_ticker: "SPY"
  cache_ttl_days: 1             # how stale price cache can be before refresh

scheduler:
  price_refresh_cron: "0 18 * * 1-5"   # 6pm weekdays (post-market)
  zillow_refresh_cron: "0 9 1 * *"     # phase 2 only; 1st of month

server:
  host: "0.0.0.0"
  port: 8080
```

---

## Project Structure

```
folio/
├── backend/
│   ├── main.py                    # FastAPI app, router registration
│   ├── config.py                  # Config loader (pydantic-settings)
│   ├── database.py                # DB connection, migrations
│   ├── scheduler.py               # APScheduler setup
│   │
│   ├── routers/
│   │   ├── portfolios.py
│   │   ├── positions.py
│   │   ├── market.py
│   │   ├── analytics.py
│   │   └── agent.py
│   │
│   ├── services/
│   │   ├── portfolio_engine.py    # Sharpe, returns, timeseries
│   │   ├── market_data.py         # yfinance now; Zillow fetch/cache in phase 2
│   │   └── agent_service.py       # LLM context builder + client
│   │
│   ├── models/
│   │   ├── db.py                  # SQLAlchemy / raw SQL models
│   │   └── schemas.py             # Pydantic request/response schemas
│   │
│   └── tests/
│       ├── test_engine.py
│       └── test_market_data.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── PositionsTable.tsx
│   │   │   ├── AgentSidebar.tsx
│   │   │   ├── AddPositionModal.tsx
│   │   │   ├── PositionDrawer.tsx
│   │   │   ├── PortfolioChart.tsx
│   │   │   └── MetricsStrip.tsx
│   │   ├── hooks/
│   │   │   ├── usePortfolio.ts
│   │   │   └── useAgentChat.ts
│   │   ├── api/
│   │   │   └── client.ts          # typed API client
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── config.yaml.example
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── README.md
```

---

## Docker Deployment

### docker-compose.yml

```yaml
version: "3.9"
services:
  folio:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ~/.folio:/data
    environment:
      FOLIO_CONFIG: /data/config.yaml
    restart: unless-stopped
```

Frontend is built at container build time and served as static files from FastAPI. No separate Nginx needed.

---

## Python Dependencies

```toml
# pyproject.toml
[project]
name = "folio"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.29",
    "yfinance>=0.2.38",
    "pandas>=2.2",
    "numpy>=1.26",
    "httpx>=0.27",              # LLM client
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "sqlalchemy>=2.0",
    "duckdb>=0.10",             # optional but included
    "apscheduler>=3.10",
    "requests>=2.32",           # Zillow CSV fetch
    "python-dotenv>=1.0",
]
```

---

## Key Implementation Notes for the Builder

1. **Sharpe is the hero metric** — it should be the most visually prominent number on the dashboard, not buried in a table. Consider a large centered display.

2. **Historical entry dates are first-class** — when a user adds a position with a past entry date, the system must reconstruct portfolio history from that date forward. The `/portfolios/{id}/timeseries` endpoint must account for positions added retroactively.

3. **Real estate tickers use a `RE:` prefix in phase 2** — the market data service must route these to the Zillow ZHVI path rather than yfinance once the deferred real-estate milestone begins. The frontend ticker search can remain stock-only until that work starts.

4. **LLM agent is optional** — if no endpoint is configured, the agent sidebar shows a setup prompt. The rest of the app must work without it.

5. **yfinance rate limiting** — batch ticker fetches where possible. On first load of a portfolio, fetch all position histories in a single yfinance download call using the `tickers` multi-ticker API.

6. **DuckDB for analytics** — the portfolio timeseries join across price cache is the hot query. If using SQLite, add composite index on `(ticker, date)`. If using DuckDB, the query planner handles it naturally.

7. **WebSocket chat** — the frontend should reconnect automatically on disconnect. Chat history for a portfolio persists in the DB; the 50-turn window is a server-side truncation before context injection.

8. **No auth in v1** — single-user self-hosted, no login. If multi-user is desired later, add HTTP Basic Auth as a thin layer.

---

## Out of Scope (Future Versions)

- Options / derivatives simulation
- Crypto asset class
- Tax lot tracking / tax simulation
- Automated strategy backtesting (rules-based)
- Push notifications / alerts
- Import from brokerage CSV (Robinhood, Fidelity exports)
- Multi-portfolio comparison view
- SEC EDGAR fundamentals via `sec-edgar-downloader` (10-K, 10-Q, 8-K filings for fundamental analysis)
