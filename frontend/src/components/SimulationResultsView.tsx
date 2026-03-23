import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";

import type { SimulationAgentDetail, SimulationAgentSummary, SimulationDistribution, SimulationResults } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";

type Props = {
  results: SimulationResults;
  agentDetail: SimulationAgentDetail | null;
  agentDetailLoading: boolean;
  onSelectAgent: (agentId: string) => void;
  onBack: () => void;
};

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatSharpe(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(3);
}

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

type SortKey = "rank" | "sharpe_ratio" | "simple_roi" | "annualized_return" | "alpha" | "max_drawdown" | "volatility";

function buildHistogramData(dist: SimulationDistribution, bucketCount = 20) {
  const range = dist.max - dist.min;
  if (range === 0) return [{ bucket: dist.min.toFixed(3), count: dist.values.length }];
  const step = range / bucketCount;
  const buckets: { bucket: string; count: number; start: number; end: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = dist.min + step * i;
    const end = start + step;
    buckets.push({ bucket: start.toFixed(2), count: 0, start, end });
  }
  for (const v of dist.values) {
    const idx = Math.min(Math.floor((v - dist.min) / step), bucketCount - 1);
    buckets[idx].count++;
  }
  return buckets;
}

function DistributionChart({ dist }: { dist: SimulationDistribution }) {
  const data = buildHistogramData(dist);
  const metricLabel = dist.metric.replace("_", " ");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium capitalize">{metricLabel}</span>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>median: {dist.median.toFixed(3)}</span>
          <span>mean: {dist.mean.toFixed(3)}</span>
        </div>
      </div>
      <ResponsiveContainer height={140} width="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="bucket" tick={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [value, "count"]}
            labelFormatter={(label) => `${metricLabel}: ${label}`}
          />
          <ReferenceLine x={dist.median.toFixed(2)} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
          <Bar dataKey="count" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>p5: {dist.p5.toFixed(3)}</span>
        <span>p25: {dist.p25.toFixed(3)}</span>
        <span>p75: {dist.p75.toFixed(3)}</span>
        <span>p95: {dist.p95.toFixed(3)}</span>
      </div>
    </div>
  );
}

function AgentDetailPanel({
  agent,
  loading,
}: {
  agent: SimulationAgentDetail | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="surface-panel border-border/80">
        <CardContent className="grid min-h-[200px] place-items-center py-8 text-sm text-muted-foreground">
          Loading agent details...
        </CardContent>
      </Card>
    );
  }
  if (!agent) return null;

  const timeseriesData = agent.timeseries.map((pt) => ({
    date: pt.date,
    value: pt.book_value,
  }));

  return (
    <Card className="surface-panel border-border/80">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-lg">{agent.label}</strong>
            <span className="ml-2 text-sm text-muted-foreground">Rank #{agent.rank}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {agent.allocations.map((a) => (
              <Badge key={a.ticker} variant="outline">
                {a.ticker} {a.weight.toFixed(0)}%
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="block text-xs text-muted-foreground">Total Value</span>
            <span className="text-sm font-semibold">{formatCurrency(agent.total_value)}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Sharpe</span>
            <span className="text-sm font-semibold">{formatSharpe(agent.sharpe_ratio)}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">ROI</span>
            <span className="text-sm font-semibold">{formatPercent(agent.simple_roi)}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Max Drawdown</span>
            <span className="text-sm font-semibold">{formatPercent(agent.max_drawdown)}</span>
          </div>
        </div>

        {timeseriesData.length > 0 && (
          <ResponsiveContainer height={200} width="100%">
            <LineChart data={timeseriesData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                hide
                domain={["dataMin", "dataMax"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatCurrency(v), "Value"]}
              />
              <Line dataKey="value" dot={false} stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function SimulationResultsView({ results, agentDetail, agentDetailLoading, onSelectAgent, onBack }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const sharpeDist = results.distributions.find((d) => d.metric === "sharpe_ratio");
  const roiDist = results.distributions.find((d) => d.metric === "simple_roi");
  const alphaDist = results.distributions.find((d) => d.metric === "alpha");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "rank");
    }
  }

  function getSortValue(agent: SimulationAgentSummary, key: SortKey): number {
    switch (key) {
      case "rank": return agent.rank;
      case "sharpe_ratio": return agent.sharpe_ratio ?? -Infinity;
      case "simple_roi": return agent.simple_roi ?? -Infinity;
      case "annualized_return": return agent.annualized_return ?? -Infinity;
      case "alpha": return agent.alpha ?? -Infinity;
      case "max_drawdown": return agent.max_drawdown ?? -Infinity;
      case "volatility": return agent.volatility ?? -Infinity;
    }
  }

  const sorted = [...results.agents].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    return sortAsc ? av - bv : bv - av;
  });

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <button
        className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => toggleSort(sortKeyValue)}
        type="button"
      >
        {label}
        {active ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button onClick={onBack} size="sm" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h2 className="text-xl font-semibold">{results.name}</h2>
        <Badge variant="outline">{results.agent_count} agents</Badge>
        <Badge variant="outline">{results.benchmark_ticker}</Badge>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="surface-panel border-border/80">
          <CardContent className="px-4 py-3">
            <span className="block text-xs text-muted-foreground">Best Sharpe</span>
            <span className="text-lg font-semibold">{formatSharpe(sharpeDist?.max ?? null)}</span>
          </CardContent>
        </Card>
        <Card className="surface-panel border-border/80">
          <CardContent className="px-4 py-3">
            <span className="block text-xs text-muted-foreground">Median Sharpe</span>
            <span className="text-lg font-semibold">{formatSharpe(sharpeDist?.median ?? null)}</span>
          </CardContent>
        </Card>
        <Card className="surface-panel border-border/80">
          <CardContent className="px-4 py-3">
            <span className="block text-xs text-muted-foreground">Best ROI</span>
            <span className="text-lg font-semibold">{formatPercent(roiDist?.max ?? null)}</span>
          </CardContent>
        </Card>
        <Card className="surface-panel border-border/80">
          <CardContent className="px-4 py-3">
            <span className="block text-xs text-muted-foreground">Median ROI</span>
            <span className="text-lg font-semibold">{formatPercent(roiDist?.median ?? null)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Distribution charts */}
      <Card className="surface-panel border-border/80">
        <CardHeader className="border-b border-border/60 pb-4">
          <strong className="text-lg">Distributions</strong>
        </CardHeader>
        <CardContent className="grid gap-8 pt-5 md:grid-cols-2 lg:grid-cols-3">
          {sharpeDist && <DistributionChart dist={sharpeDist} />}
          {roiDist && <DistributionChart dist={roiDist} />}
          {alphaDist && <DistributionChart dist={alphaDist} />}
          {results.distributions
            .filter((d) => !["sharpe_ratio", "simple_roi", "alpha"].includes(d.metric))
            .map((d) => (
              <DistributionChart dist={d} key={d.metric} />
            ))}
        </CardContent>
      </Card>

      {/* Agent ranking table */}
      <Card className="surface-panel border-border/80">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
          <strong className="text-lg">Agent Rankings</strong>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button disabled={page === 0} onClick={() => setPage(page - 1)} size="sm" variant="ghost">
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} size="sm" variant="ghost">
                Next
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left"><SortHeader label="Rank" sortKeyValue="rank" /></th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Label</th>
                <th className="px-3 py-2 text-right"><SortHeader label="Sharpe" sortKeyValue="sharpe_ratio" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="ROI" sortKeyValue="simple_roi" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Ann. Return" sortKeyValue="annualized_return" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Alpha" sortKeyValue="alpha" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Drawdown" sortKeyValue="max_drawdown" /></th>
                <th className="px-3 py-2 text-right"><SortHeader label="Volatility" sortKeyValue="volatility" /></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((agent) => (
                <tr
                  className={`cursor-pointer border-b border-border/40 transition-colors ${
                    selectedAgentId === agent.id ? "bg-primary/5" : "hover:bg-card/80"
                  }`}
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    onSelectAgent(agent.id);
                  }}
                >
                  <td className="px-3 py-2.5 font-medium">#{agent.rank}</td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[200px] truncate">{agent.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatSharpe(agent.sharpe_ratio)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(agent.simple_roi)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(agent.annualized_return)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatSharpe(agent.alpha)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(agent.max_drawdown)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(agent.volatility)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Agent detail panel */}
      <AgentDetailPanel agent={agentDetail} loading={agentDetailLoading} />
    </div>
  );
}
