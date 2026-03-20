import { AllocationSlice, BootstrapConfig, PortfolioDetail, PositionWithMetrics, TimeSeriesPoint } from "../api/client";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import MetricsStrip from "./MetricsStrip";
import PortfolioChart from "./PortfolioChart";
import PositionsTable from "./PositionsTable";

type Props = {
  bootstrap: BootstrapConfig;
  detail: PortfolioDetail;
  allocation: AllocationSlice[];
  timeseries: TimeSeriesPoint[];
  showBenchmark: boolean;
  onToggleBenchmark: () => void;
  onAddPosition: () => void;
  onSelectPosition: (position: PositionWithMetrics) => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function Dashboard({
  bootstrap,
  detail,
  allocation,
  timeseries,
  showBenchmark,
  onToggleBenchmark,
  onAddPosition,
  onSelectPosition,
}: Props) {
  return (
    <section className="grid gap-5">
      <header className="grid gap-6 rounded-[32px] border border-border/70 bg-card/80 p-7 shadow-panel backdrop-blur-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-foreground">
            Portfolio Simulator
          </div>
          <div className="space-y-3">
            <h1 className="text-balance text-5xl leading-[0.95]">{detail.name}</h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {detail.description || "Simulate positions against real market history with risk-adjusted analytics."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <Button size="lg" onClick={onAddPosition} type="button">
            Add Position
          </Button>
          <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
            Benchmark: <strong className="text-foreground">{bootstrap.benchmark_ticker}</strong> · Risk-free rate{" "}
            <strong className="text-foreground">{bootstrap.risk_free_rate.toFixed(2)}%</strong>
          </div>
        </div>
      </header>
      <MetricsStrip metrics={detail.metrics} />
      <PortfolioChart
        data={timeseries}
        benchmarkLabel={detail.metrics.benchmark_ticker}
        onToggleBenchmark={onToggleBenchmark}
        showBenchmark={showBenchmark}
      />
      <Card>
        <CardHeader>
          <CardTitle>Allocation</CardTitle>
          <CardDescription>Current portfolio mix including cash.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {allocation.map((slice) => (
            <div
              className="flex items-center justify-between rounded-3xl border border-border/70 bg-background/70 px-4 py-4"
              key={slice.ticker}
            >
              <div>
                <strong className="block text-base">{slice.label}</strong>
                <span className="mt-1 block text-sm text-muted-foreground">{money.format(slice.value)}</span>
              </div>
              <span className="text-sm font-semibold">{(slice.weight * 100).toFixed(2)}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <PositionsTable onSelect={onSelectPosition} positions={detail.positions} />
    </section>
  );
}
