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
    <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(18,23,29,0.98),rgba(13,16,21,0.98))]">
      <CardHeader className="flex flex-col gap-4 border-b border-white/6 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Replay Monitor
          </div>
          <CardTitle>Portfolio Replay</CardTitle>
          <CardDescription>Track the book over time with a chart surface that feels closer to a terminal than a dashboard.</CardDescription>
        </div>
        <Button variant="secondary" onClick={onToggleBenchmark} type="button">
          {showBenchmark ? `Hide ${benchmarkLabel}` : `Show ${benchmarkLabel}`}
        </Button>
      </CardHeader>
      <CardContent className="pt-6">
        {data.length ? (
          <div className="h-[420px] rounded-[18px] border border-white/6 bg-[radial-gradient(circle_at_top,rgba(93,215,224,0.08),transparent_24%),linear-gradient(180deg,rgba(10,13,17,0.96),rgba(15,18,23,0.92))] p-3">
            <ResponsiveContainer width="100%" height={420}>
              <AreaChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-rust))" stopOpacity={0.72} />
                    <stop offset="100%" stopColor="hsl(var(--chart-rust))" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 8" stroke="hsla(var(--border),0.9)" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={28}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  tickFormatter={currency}
                  tickLine={false}
                  width={88}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "14px",
                    borderColor: "hsl(var(--border))",
                    backgroundColor: "rgba(9, 12, 16, 0.94)",
                  }}
                  formatter={(value: number) => currency(value)}
                />
                <Area
                  type="monotone"
                  dataKey="portfolio_value"
                  fill="url(#portfolioFill)"
                  stroke="hsl(var(--chart-rust))"
                  strokeWidth={2.3}
                />
                {showBenchmark ? (
                  <Line
                    type="monotone"
                    dataKey="benchmark_value"
                    dot={false}
                    stroke="hsl(var(--chart-teal))"
                    strokeDasharray="7 5"
                    strokeWidth={2}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-[420px] place-items-center rounded-[18px] border border-dashed border-white/6 bg-background/45 px-6 text-center text-sm text-muted-foreground">
            <p>Add a position to start the replay curve.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
