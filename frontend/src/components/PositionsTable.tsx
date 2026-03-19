import { useMemo, useState } from "react";

import { PositionWithMetrics } from "../api/client";

type SortKey = "ticker" | "current_value" | "simple_roi" | "annualized_return" | "sharpe_ratio" | "weight";

type Props = {
  positions: PositionWithMetrics[];
  onSelect: (position: PositionWithMetrics) => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function percent(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function sharpeTone(value: number | null) {
  if (value === null) return "tone-muted";
  if (value < 0) return "tone-red";
  if (value < 1) return "tone-yellow";
  if (value < 2) return "tone-green";
  return "tone-teal";
}

export default function PositionsTable({ positions, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const clone = [...positions];
    clone.sort((a, b) => {
      const left = a[sortKey] ?? -Infinity;
      const right = b[sortKey] ?? -Infinity;
      if (typeof left === "string" && typeof right === "string") {
        return descending ? right.localeCompare(left) : left.localeCompare(right);
      }
      return descending ? Number(right) - Number(left) : Number(left) - Number(right);
    });
    return clone;
  }, [descending, positions, sortKey]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(nextKey);
    setDescending(true);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Positions</h2>
          <p>Sortable live metrics for simulated holdings.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="positions-table">
          <thead>
            <tr>
              <th>
                <button onClick={() => updateSort("ticker")} type="button">
                  Ticker
                </button>
              </th>
              <th>Type</th>
              <th>Shares</th>
              <th>Entry</th>
              <th>Current</th>
              <th>
                <button onClick={() => updateSort("simple_roi")} type="button">
                  ROI
                </button>
              </th>
              <th>
                <button onClick={() => updateSort("annualized_return")} type="button">
                  Ann.
                </button>
              </th>
              <th>
                <button onClick={() => updateSort("sharpe_ratio")} type="button">
                  Sharpe
                </button>
              </th>
              <th>
                <button onClick={() => updateSort("weight")} type="button">
                  Weight
                </button>
              </th>
              <th>
                <button onClick={() => updateSort("current_value")} type="button">
                  P&L
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => (
              <tr key={position.id} onClick={() => onSelect(position)}>
                <td>
                  <div className="ticker-cell">
                    <strong>{position.ticker}</strong>
                    <span>{position.status}</span>
                  </div>
                </td>
                <td>{position.asset_type}</td>
                <td>{position.shares.toFixed(3)}</td>
                <td>{money.format(position.entry_price)}</td>
                <td>{money.format(position.current_price)}</td>
                <td className={position.simple_roi >= 0 ? "tone-green" : "tone-red"}>
                  {percent(position.simple_roi)}
                </td>
                <td>{percent(position.annualized_return)}</td>
                <td className={sharpeTone(position.sharpe_ratio)}>
                  {position.sharpe_ratio === null ? "n/a" : position.sharpe_ratio.toFixed(2)}
                </td>
                <td>{percent(position.weight)}</td>
                <td className={position.dollar_pnl >= 0 ? "tone-green" : "tone-red"}>
                  {money.format(position.dollar_pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

