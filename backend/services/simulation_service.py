from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_DOWN
from math import sqrt

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.errors import ApiErrorException
from backend.models.db import (
    Portfolio,
    Position,
    Simulation,
    SimulationAgent,
    StrategyTemplate,
    Workspace,
)
from backend.models.schemas import (
    BookAllocationCreate,
    BookAllocationPreview,
    BookTimeSeriesPoint,
    SimulationAgentDetail,
    SimulationAgentSummary,
    SimulationCreate,
    SimulationDistribution,
    SimulationResults,
    SimulationSummary,
)
from backend.services.app_config_service import get_runtime_settings
from backend.services.portfolio_engine import PortfolioEngine
from backend.services.run_eligibility import RunEligibilityService
from backend.services.simulation_generators import generate_allocations

logger = logging.getLogger(__name__)

SHARE_PRECISION = Decimal("0.000001")


class SimulationService:
    def __init__(self, session: Session):
        self.session = session
        self.settings = get_runtime_settings(session)
        self.engine = PortfolioEngine(session)
        self.eligibility = RunEligibilityService(session)

    def create_simulation(
        self,
        workspace_id: str,
        payload: SimulationCreate,
    ) -> SimulationSummary:
        workspace = self.session.get(Workspace, workspace_id)
        if workspace is None:
            raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")

        initial_cash = payload.initial_cash or workspace.initial_cash
        benchmark_ticker = (payload.benchmark_ticker or self.settings.market.benchmark_ticker).upper()

        generator_params = payload.generator_params
        if payload.strategy_template_id:
            template = self.session.get(StrategyTemplate, payload.strategy_template_id)
            if template is None:
                raise ApiErrorException(404, "template_not_found", "Strategy template not found.")
            generator_params = json.loads(template.params)

        allocation_sets = generate_allocations(
            payload.generator_kind,
            generator_params,
            payload.agent_count,
        )

        all_tickers = sorted({
            alloc.ticker.upper()
            for alloc_set in allocation_sets
            for alloc in alloc_set
        })
        opening_session, _ = self.eligibility.validate_book_allocations(
            start_date=workspace.start_date,
            allocations=[BookAllocationCreate(ticker=t, asset_type="stock", weight=1) for t in all_tickers],
        )

        simulation = Simulation(
            workspace_id=workspace_id,
            name=payload.name.strip(),
            description=payload.description.strip(),
            status="pending",
            agent_count=payload.agent_count,
            generator_kind=payload.generator_kind,
            generator_params=json.dumps(generator_params),
            initial_cash=initial_cash,
            start_date=workspace.start_date,
            benchmark_ticker=benchmark_ticker,
            strategy_template_id=payload.strategy_template_id,
        )
        self.session.add(simulation)
        self.session.flush()

        for idx, alloc_set in enumerate(allocation_sets):
            label = _build_agent_label(alloc_set, idx)
            agent = SimulationAgent(
                simulation_id=simulation.id,
                label=label,
                allocations_json=json.dumps([
                    {"ticker": a.ticker, "asset_type": a.asset_type, "weight": float(a.weight)}
                    for a in alloc_set
                ]),
                sort_order=idx,
            )
            self.session.add(agent)

        self.session.commit()
        return self._to_summary(simulation)

    def run_simulation(self, simulation_id: str) -> None:
        simulation = self.session.get(Simulation, simulation_id)
        if simulation is None:
            return

        try:
            simulation.status = "running"
            self.session.commit()

            workspace = simulation.workspace
            opening_session, resolved_prices = self.eligibility.validate_book_allocations(
                start_date=workspace.start_date,
                allocations=[
                    BookAllocationCreate(ticker=t, asset_type="stock", weight=1)
                    for t in self._all_tickers(simulation)
                ],
            )

            temp_portfolios: list[Portfolio] = []
            agent_map: dict[str, SimulationAgent] = {}

            for agent in simulation.agents:
                allocs = json.loads(agent.allocations_json)
                portfolio = Portfolio(
                    id=agent.id,
                    workspace_id=simulation.workspace_id,
                    name=agent.label,
                    initial_cash=simulation.initial_cash,
                    strategy_kind="custom",
                )

                positions = []
                for alloc in allocs:
                    ticker = alloc["ticker"].upper()
                    resolved = resolved_prices[ticker]
                    capital = simulation.initial_cash * Decimal(str(alloc["weight"])) / Decimal("100")
                    shares = (capital / resolved.close).quantize(SHARE_PRECISION, rounding=ROUND_DOWN)
                    if shares <= 0:
                        continue
                    positions.append(Position(
                        id=str(uuid.uuid4()),
                        portfolio_id=agent.id,
                        asset_type=alloc.get("asset_type", "stock"),
                        ticker=ticker,
                        shares=shares,
                        entry_price=resolved.close,
                        entry_date=opening_session,
                        notes="",
                    ))

                portfolio.positions = positions
                portfolio.allocations = []
                temp_portfolios.append(portfolio)
                agent_map[agent.id] = agent

            if not temp_portfolios:
                simulation.status = "completed"
                simulation.completed_at = datetime.now(timezone.utc)
                self.session.commit()
                return

            # Load shared price frame once for all batches
            all_tickers = sorted(
                {pos.ticker for p in temp_portfolios for pos in p.positions}
                | {simulation.benchmark_ticker}
            )
            effective_as_of = min(date.today(), date.today())
            shared_frame = self.engine.market_data.load_price_frame(
                all_tickers, simulation.start_date, effective_as_of,
            )

            # Process in batches so completed_count updates are visible to polling
            batch_size = 25
            for batch_start in range(0, len(temp_portfolios), batch_size):
                batch = temp_portfolios[batch_start:batch_start + batch_size]

                results = self.engine.analyze_portfolios(
                    batch,
                    start_date=simulation.start_date,
                    primary_benchmark_ticker=simulation.benchmark_ticker,
                    price_frame=shared_frame,
                )

                for portfolio_id, analysis in results.items():
                    agent = agent_map[portfolio_id]
                    metrics = analysis.metrics
                    agent.total_value = metrics.total_value
                    agent.simple_roi = metrics.simple_roi
                    agent.annualized_return = metrics.annualized_return
                    agent.sharpe_ratio = metrics.sharpe_ratio
                    agent.alpha = metrics.alpha
                    agent.beta = metrics.beta
                    agent.benchmark_return = metrics.benchmark_return

                    ts_values = [pt.book_value for pt in analysis.timeseries]
                    agent.max_drawdown = _compute_max_drawdown(ts_values)
                    agent.volatility = _compute_volatility(ts_values)

                    agent.timeseries_json = json.dumps([
                        [pt.date.isoformat(), pt.book_value]
                        for pt in analysis.timeseries
                    ])

                simulation.completed_count += len(batch)
                self.session.commit()

            simulation.status = "completed"
            simulation.completed_at = datetime.now(timezone.utc)
            self.session.commit()

        except Exception:
            logger.exception("Simulation %s failed", simulation_id)
            simulation.status = "failed"
            simulation.error_message = "An unexpected error occurred during simulation execution."
            self.session.commit()

    def list_simulations(self, workspace_id: str) -> list[SimulationSummary]:
        workspace = self.session.get(Workspace, workspace_id)
        if workspace is None:
            raise ApiErrorException(404, "workspace_not_found", "Workspace not found.")
        simulations = (
            self.session.execute(
                select(Simulation)
                .where(Simulation.workspace_id == workspace_id)
                .order_by(Simulation.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [self._to_summary(s) for s in simulations]

    def get_simulation(self, simulation_id: str) -> SimulationSummary:
        simulation = self.session.get(Simulation, simulation_id)
        if simulation is None:
            raise ApiErrorException(404, "simulation_not_found", "Simulation not found.")
        return self._to_summary(simulation)

    def get_simulation_results(self, simulation_id: str) -> SimulationResults:
        simulation = self.session.get(Simulation, simulation_id)
        if simulation is None:
            raise ApiErrorException(404, "simulation_not_found", "Simulation not found.")

        agents = sorted(simulation.agents, key=lambda a: a.sort_order)
        completed_agents = [a for a in agents if a.total_value is not None]

        ranked = sorted(
            completed_agents,
            key=lambda a: a.sharpe_ratio if a.sharpe_ratio is not None else float("-inf"),
            reverse=True,
        )

        agent_summaries = []
        for rank, agent in enumerate(ranked, 1):
            allocs = json.loads(agent.allocations_json)
            agent_summaries.append(SimulationAgentSummary(
                id=agent.id,
                label=agent.label,
                allocations=[
                    BookAllocationPreview(
                        ticker=a["ticker"],
                        asset_type=a.get("asset_type", "stock"),
                        weight=a["weight"],
                    )
                    for a in allocs
                ],
                total_value=agent.total_value,
                simple_roi=agent.simple_roi,
                annualized_return=agent.annualized_return,
                sharpe_ratio=agent.sharpe_ratio,
                alpha=agent.alpha,
                beta=agent.beta,
                max_drawdown=agent.max_drawdown,
                volatility=agent.volatility,
                benchmark_return=agent.benchmark_return,
                rank=rank,
            ))

        distributions = _build_distributions(completed_agents)

        best_agent = ranked[0] if ranked else None
        worst_agent = ranked[-1] if ranked else None

        return SimulationResults(
            simulation_id=simulation.id,
            workspace_id=simulation.workspace_id,
            name=simulation.name,
            status=simulation.status,
            agent_count=simulation.agent_count,
            completed_count=simulation.completed_count,
            benchmark_ticker=simulation.benchmark_ticker,
            start_date=simulation.start_date,
            initial_cash=float(simulation.initial_cash),
            distributions=distributions,
            agents=agent_summaries,
            best_agent_id=best_agent.id if best_agent else None,
            worst_agent_id=worst_agent.id if worst_agent else None,
        )

    def get_agent_detail(self, simulation_id: str, agent_id: str) -> SimulationAgentDetail:
        agent = self.session.get(SimulationAgent, agent_id)
        if agent is None or agent.simulation_id != simulation_id:
            raise ApiErrorException(404, "agent_not_found", "Simulation agent not found.")

        allocs = json.loads(agent.allocations_json)
        timeseries: list[BookTimeSeriesPoint] = []
        if agent.timeseries_json:
            raw = json.loads(agent.timeseries_json)
            timeseries = [
                BookTimeSeriesPoint(date=date.fromisoformat(d), book_value=v, cash=0.0)
                for d, v in raw
            ]

        simulation = agent.simulation
        ranked_agents = sorted(
            [a for a in simulation.agents if a.total_value is not None],
            key=lambda a: a.sharpe_ratio if a.sharpe_ratio is not None else float("-inf"),
            reverse=True,
        )
        rank = next((i for i, a in enumerate(ranked_agents, 1) if a.id == agent_id), 0)

        return SimulationAgentDetail(
            id=agent.id,
            label=agent.label,
            allocations=[
                BookAllocationPreview(
                    ticker=a["ticker"],
                    asset_type=a.get("asset_type", "stock"),
                    weight=a["weight"],
                )
                for a in allocs
            ],
            total_value=agent.total_value,
            simple_roi=agent.simple_roi,
            annualized_return=agent.annualized_return,
            sharpe_ratio=agent.sharpe_ratio,
            alpha=agent.alpha,
            beta=agent.beta,
            max_drawdown=agent.max_drawdown,
            volatility=agent.volatility,
            benchmark_return=agent.benchmark_return,
            rank=rank,
            timeseries=timeseries,
        )

    def delete_simulation(self, simulation_id: str) -> None:
        simulation = self.session.get(Simulation, simulation_id)
        if simulation is None:
            raise ApiErrorException(404, "simulation_not_found", "Simulation not found.")
        self.session.delete(simulation)
        self.session.commit()

    def _all_tickers(self, simulation: Simulation) -> list[str]:
        tickers: set[str] = set()
        for agent in simulation.agents:
            allocs = json.loads(agent.allocations_json)
            for a in allocs:
                tickers.add(a["ticker"].upper())
        return sorted(tickers)

    def _to_summary(self, simulation: Simulation) -> SimulationSummary:
        best_sharpe = None
        median_sharpe = None
        best_roi = None
        median_roi = None

        if simulation.status == "completed":
            sharpes = [a.sharpe_ratio for a in simulation.agents if a.sharpe_ratio is not None]
            rois = [a.simple_roi for a in simulation.agents if a.simple_roi is not None]
            if sharpes:
                best_sharpe = max(sharpes)
                median_sharpe = float(np.median(sharpes))
            if rois:
                best_roi = max(rois)
                median_roi = float(np.median(rois))

        return SimulationSummary(
            id=simulation.id,
            workspace_id=simulation.workspace_id,
            name=simulation.name,
            description=simulation.description,
            status=simulation.status,
            agent_count=simulation.agent_count,
            completed_count=simulation.completed_count,
            generator_kind=simulation.generator_kind,
            initial_cash=float(simulation.initial_cash),
            start_date=simulation.start_date,
            benchmark_ticker=simulation.benchmark_ticker,
            created_at=simulation.created_at,
            completed_at=simulation.completed_at,
            error_message=simulation.error_message,
            best_sharpe=best_sharpe,
            median_sharpe=median_sharpe,
            best_roi=best_roi,
            median_roi=median_roi,
        )


def _build_agent_label(allocations: list[BookAllocationCreate], index: int) -> str:
    if len(allocations) <= 4:
        parts = [f"{a.ticker} {float(a.weight):.0f}%" for a in allocations]
        return " / ".join(parts)
    return f"Agent #{index + 1}"


def _compute_max_drawdown(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    arr = np.array(values)
    peak = np.maximum.accumulate(arr)
    drawdowns = (arr - peak) / np.where(peak > 0, peak, 1.0)
    return float(drawdowns.min())


def _compute_volatility(values: list[float]) -> float | None:
    if len(values) < 30:
        return None
    arr = np.array(values)
    returns = np.diff(arr) / arr[:-1]
    return float(np.std(returns) * sqrt(252))


def _build_distributions(agents: list[SimulationAgent]) -> list[SimulationDistribution]:
    metrics = [
        ("sharpe_ratio", lambda a: a.sharpe_ratio),
        ("simple_roi", lambda a: a.simple_roi),
        ("annualized_return", lambda a: a.annualized_return),
        ("alpha", lambda a: a.alpha),
        ("beta", lambda a: a.beta),
        ("max_drawdown", lambda a: a.max_drawdown),
        ("volatility", lambda a: a.volatility),
    ]
    distributions = []
    for metric_name, getter in metrics:
        values = sorted([getter(a) for a in agents if getter(a) is not None])
        if not values:
            continue
        arr = np.array(values)
        distributions.append(SimulationDistribution(
            metric=metric_name,
            values=values,
            mean=float(arr.mean()),
            median=float(np.median(arr)),
            std=float(arr.std()),
            min=float(arr.min()),
            max=float(arr.max()),
            p5=float(np.percentile(arr, 5)),
            p25=float(np.percentile(arr, 25)),
            p75=float(np.percentile(arr, 75)),
            p95=float(np.percentile(arr, 95)),
        ))
    return distributions
