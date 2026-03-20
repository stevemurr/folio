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
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

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
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <CardTitle>Portfolio Replay</CardTitle>
          <CardDescription>Daily replay of portfolio value with a benchmark overlay.</CardDescription>
        </div>
        <Button variant="secondary" onClick={onToggleBenchmark} type="button">
          {showBenchmark ? `Hide ${benchmarkLabel}` : `Show ${benchmarkLabel}`}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-rust))" stopOpacity={0.72} />
                  <stop offset="100%" stopColor="hsl(var(--chart-rust))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tickFormatter={currency} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip formatter={(value: number) => currency(value)} />
              <Area
                type="monotone"
                dataKey="portfolio_value"
                stroke="hsl(var(--chart-rust))"
                fill="url(#portfolioFill)"
                strokeWidth={2.2}
              />
              {showBenchmark ? (
                <Line
                  type="monotone"
                  dataKey="benchmark_value"
                  stroke="hsl(var(--chart-teal))"
                  strokeDasharray="5 3"
                  dot={false}
                  strokeWidth={2}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
