from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.errors import ApiErrorException
from backend.models.schemas import BookAllocationCreate


@dataclass
class GeneratedAllocation:
    ticker: str
    asset_type: str
    weight: float


def generate_allocations(
    generator_kind: str,
    params: dict,
    agent_count: int,
) -> list[list[BookAllocationCreate]]:
    generators = {
        "fixed": _generate_fixed,
        "equal_weight": _generate_equal_weight,
        "random_weight": _generate_random_weight,
        "sweep": _generate_sweep,
        "subset": _generate_subset,
    }
    generator = generators.get(generator_kind)
    if generator is None:
        raise ApiErrorException(
            422,
            "invalid_generator",
            f"Unknown generator kind: {generator_kind}",
        )
    return generator(params, agent_count)


def _parse_universe(params: dict) -> list[tuple[str, str]]:
    """Parse universe from params, returning list of (ticker, asset_type) tuples."""
    universe = params.get("universe", [])
    if not universe:
        raise ApiErrorException(422, "invalid_params", "Generator requires a non-empty 'universe' list.")
    result = []
    for item in universe:
        if isinstance(item, str):
            result.append((item.upper(), "stock"))
        elif isinstance(item, dict):
            result.append((item["ticker"].upper(), item.get("asset_type", "stock")))
        else:
            raise ApiErrorException(422, "invalid_params", f"Invalid universe item: {item}")
    return result


def _to_allocations(items: list[tuple[str, str, float]]) -> list[BookAllocationCreate]:
    """Convert (ticker, asset_type, weight) tuples to BookAllocationCreate list."""
    return [
        BookAllocationCreate(ticker=ticker, asset_type=asset_type, weight=round(weight, 4))
        for ticker, asset_type, weight in items
    ]


def _generate_fixed(params: dict, agent_count: int) -> list[list[BookAllocationCreate]]:
    allocations_raw = params.get("allocations", [])
    if not allocations_raw:
        raise ApiErrorException(422, "invalid_params", "Fixed generator requires an 'allocations' list.")
    allocations = [
        BookAllocationCreate(
            ticker=a["ticker"].upper(),
            asset_type=a.get("asset_type", "stock"),
            weight=a["weight"],
        )
        for a in allocations_raw
    ]
    return [allocations for _ in range(agent_count)]


def _generate_equal_weight(params: dict, agent_count: int) -> list[list[BookAllocationCreate]]:
    universe = _parse_universe(params)
    weight = round(100.0 / len(universe), 4)
    allocations = _to_allocations([(t, at, weight) for t, at in universe])
    return [allocations for _ in range(agent_count)]


def _generate_random_weight(params: dict, agent_count: int) -> list[list[BookAllocationCreate]]:
    universe = _parse_universe(params)
    n_assets = len(universe)
    min_weight = params.get("min_weight", 0.0)
    max_weight = params.get("max_weight", 100.0)

    rng = np.random.default_rng()
    results: list[list[BookAllocationCreate]] = []

    for _ in range(agent_count):
        for _attempt in range(100):
            raw = rng.dirichlet(np.ones(n_assets))
            weights = raw * 100.0
            if min_weight > 0 or max_weight < 100:
                if all(min_weight <= w <= max_weight for w in weights):
                    break
            else:
                break
        else:
            weights = raw * 100.0

        items = [(t, at, float(w)) for (t, at), w in zip(universe, weights)]
        results.append(_to_allocations(items))

    return results


def _generate_sweep(params: dict, agent_count: int) -> list[list[BookAllocationCreate]]:
    ticker_a = params.get("ticker_a", "").upper()
    ticker_b = params.get("ticker_b", "").upper()
    if not ticker_a or not ticker_b:
        raise ApiErrorException(422, "invalid_params", "Sweep generator requires 'ticker_a' and 'ticker_b'.")
    asset_type_a = params.get("asset_type_a", "stock")
    asset_type_b = params.get("asset_type_b", "stock")

    results: list[list[BookAllocationCreate]] = []
    for i in range(agent_count):
        weight_a = 100.0 * (agent_count - 1 - i) / max(agent_count - 1, 1)
        weight_b = 100.0 - weight_a
        results.append(_to_allocations([
            (ticker_a, asset_type_a, weight_a),
            (ticker_b, asset_type_b, weight_b),
        ]))
    return results


def _generate_subset(params: dict, agent_count: int) -> list[list[BookAllocationCreate]]:
    universe = _parse_universe(params)
    pick_count = params.get("pick_count", 3)
    if pick_count > len(universe):
        raise ApiErrorException(
            422, "invalid_params",
            f"pick_count ({pick_count}) cannot exceed universe size ({len(universe)}).",
        )

    rng = np.random.default_rng()
    results: list[list[BookAllocationCreate]] = []
    weight = round(100.0 / pick_count, 4)

    for _ in range(agent_count):
        indices = rng.choice(len(universe), size=pick_count, replace=False)
        picked = [universe[i] for i in sorted(indices)]
        results.append(_to_allocations([(t, at, weight) for t, at in picked]))

    return results
