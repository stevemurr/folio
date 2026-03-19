import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TimeSeriesPoint } from "../api/client";

type Props = {
  data: TimeSeriesPoint[];
  benchmarkLabel: string;
  showBenchmark: boolean;
  onToggleBenchmark: () => void;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value,
  );
}

export default function PortfolioChart({
  data,
  benchmarkLabel,
  showBenchmark,
  onToggleBenchmark,
}: Props) {
  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <div>
          <h2>Portfolio Replay</h2>
          <p>Daily replay of portfolio value with a benchmark overlay.</p>
        </div>
        <button className="secondary-button" onClick={onToggleBenchmark} type="button">
          {showBenchmark ? `Hide ${benchmarkLabel}` : `Show ${benchmarkLabel}`}
        </button>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d77a61" stopOpacity={0.72} />
                <stop offset="100%" stopColor="#f1d6c8" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#d6c5bb" />
            <XAxis dataKey="date" tick={{ fill: "#5f544e", fontSize: 12 }} />
            <YAxis tickFormatter={currency} tick={{ fill: "#5f544e", fontSize: 12 }} />
            <Tooltip formatter={(value: number) => currency(value)} />
            <Area
              type="monotone"
              dataKey="portfolio_value"
              stroke="#8d493a"
              fill="url(#portfolioFill)"
              strokeWidth={2.2}
            />
            {showBenchmark ? (
              <Line
                type="monotone"
                dataKey="benchmark_value"
                stroke="#295c69"
                strokeDasharray="5 3"
                dot={false}
                strokeWidth={2}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

