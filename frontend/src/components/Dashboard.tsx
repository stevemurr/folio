import { AllocationSlice, BootstrapConfig, PortfolioDetail, PositionWithMetrics, TimeSeriesPoint } from "../api/client";
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
    <section className="dashboard">
      <header className="hero-panel">
        <div>
          <span className="eyebrow">Portfolio Simulator</span>
          <h1>{detail.name}</h1>
          <p>{detail.description || "Simulate positions against real market history with risk-adjusted analytics."}</p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={onAddPosition} type="button">
            Add Position
          </button>
          <div className="hero-caption">
            Benchmark: <strong>{bootstrap.benchmark_ticker}</strong> · Risk-free rate{" "}
            <strong>{bootstrap.risk_free_rate.toFixed(2)}%</strong>
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
      <section className="panel allocation-panel">
        <div className="panel-header">
          <div>
            <h2>Allocation</h2>
            <p>Current portfolio mix including cash.</p>
          </div>
        </div>
        <div className="allocation-list">
          {allocation.map((slice) => (
            <div className="allocation-row" key={slice.ticker}>
              <div>
                <strong>{slice.label}</strong>
                <span>{money.format(slice.value)}</span>
              </div>
              <span>{(slice.weight * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </section>
      <PositionsTable onSelect={onSelectPosition} positions={detail.positions} />
    </section>
  );
}

