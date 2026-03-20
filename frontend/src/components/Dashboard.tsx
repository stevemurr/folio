import { AllocationSlice, BootstrapConfig, PortfolioDetail, PositionWithMetrics, TimeSeriesPoint } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
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

function percent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

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
    <section className="grid gap-4">
      <header className="grid gap-5 rounded-[20px] border border-white/8 bg-[linear-gradient(135deg,rgba(18,24,30,0.96),rgba(13,16,21,0.98))] p-6 shadow-panel lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Replay Desk</Badge>
            <Badge variant="outline">{detail.metrics.open_position_count} open positions</Badge>
            <Badge variant="outline">{percent(detail.metrics.simple_roi)} return</Badge>
          </div>
          <div className="space-y-3">
            <h1 className="text-balance text-5xl leading-[0.92] sm:text-6xl">{detail.name}</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {detail.description || "Simulate positions against real market history with disciplined cash and a live book."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[16px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Total Value
              </span>
              <strong className="mt-2 block font-mono text-2xl">{money.format(detail.metrics.total_value)}</strong>
            </div>
            <div className="rounded-[16px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Cash Ready
              </span>
              <strong className="mt-2 block font-mono text-2xl">{money.format(detail.metrics.current_cash)}</strong>
            </div>
            <div className="rounded-[16px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Alpha vs {bootstrap.benchmark_ticker}
              </span>
              <strong className="mt-2 block font-mono text-2xl">{percent(detail.metrics.alpha)}</strong>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:min-w-[16rem] lg:items-stretch">
          <div className="rounded-[18px] border border-white/6 bg-background/55 px-4 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Benchmark Spread
            </span>
            <div className="mt-2 flex items-end justify-between gap-4">
              <strong className="font-mono text-2xl">{bootstrap.benchmark_ticker}</strong>
              <span className="text-right text-sm leading-5 text-muted-foreground">
                Risk-free
                <br />
                {bootstrap.risk_free_rate.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="rounded-[18px] border border-white/6 bg-background/55 px-4 py-4 text-sm leading-6 text-muted-foreground">
            Started with <strong className="text-foreground">{money.format(detail.initial_cash)}</strong> across{" "}
            <strong className="text-foreground">{detail.metrics.position_count}</strong> tracked positions.
          </div>
          <Button className="justify-between" size="lg" onClick={onAddPosition} type="button">
            Add Position
            <span className="font-mono text-xs">TRADE+</span>
          </Button>
        </div>
      </header>

      <PortfolioChart
        data={timeseries}
        benchmarkLabel={detail.metrics.benchmark_ticker}
        onToggleBenchmark={onToggleBenchmark}
        showBenchmark={showBenchmark}
      />
      <MetricsStrip metrics={detail.metrics} />
      <PositionsTable allocation={allocation} onSelect={onSelectPosition} positions={detail.positions} />
    </section>
  );
}
