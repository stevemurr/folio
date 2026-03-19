import { PortfolioMetrics } from "../api/client";

function percent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function number(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type Props = {
  metrics: PortfolioMetrics;
};

export default function MetricsStrip({ metrics }: Props) {
  return (
    <section className="metrics-grid">
      <article className="metric-card metric-hero">
        <span className="metric-label">Sharpe Ratio</span>
        <strong className="metric-value">{number(metrics.sharpe_ratio)}</strong>
        <span className="metric-caption">Risk-adjusted return is the lead signal.</span>
      </article>
      <article className="metric-card">
        <span className="metric-label">Total Value</span>
        <strong className="metric-value">{currency(metrics.total_value)}</strong>
      </article>
      <article className="metric-card">
        <span className="metric-label">Annualized Return</span>
        <strong className="metric-value">{percent(metrics.annualized_return)}</strong>
      </article>
      <article className="metric-card">
        <span className="metric-label">Alpha vs {metrics.benchmark_ticker}</span>
        <strong className="metric-value">{percent(metrics.alpha)}</strong>
      </article>
      <article className="metric-card">
        <span className="metric-label">Cash Remaining</span>
        <strong className="metric-value">{currency(metrics.current_cash)}</strong>
      </article>
    </section>
  );
}

