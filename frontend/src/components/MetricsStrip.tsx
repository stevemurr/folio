import { PortfolioMetrics } from "../api/client";
import { Card, CardContent } from "./ui/card";

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
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary to-primary/75 text-primary-foreground xl:col-span-2">
        <CardContent className="space-y-4 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/75">
            Sharpe Ratio
          </span>
          <strong className="block text-5xl leading-none">{number(metrics.sharpe_ratio)}</strong>
          <span className="block max-w-xs text-sm leading-6 text-primary-foreground/85">
            Risk-adjusted return is the lead signal.
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Total Value
          </span>
          <strong className="block text-3xl leading-none">{currency(metrics.total_value)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Annualized Return
          </span>
          <strong className="block text-3xl leading-none">{percent(metrics.annualized_return)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Alpha vs {metrics.benchmark_ticker}
          </span>
          <strong className="block text-3xl leading-none">{percent(metrics.alpha)}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Cash Remaining
          </span>
          <strong className="block text-3xl leading-none">{currency(metrics.current_cash)}</strong>
        </CardContent>
      </Card>
    </section>
  );
}
