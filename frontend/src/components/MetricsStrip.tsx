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
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
      <Card className="overflow-hidden border-primary/20 bg-[linear-gradient(135deg,rgba(242,139,61,0.18),rgba(19,24,30,0.92))]">
        <CardContent className="grid gap-5 px-6 py-6 sm:grid-cols-[auto_1fr] sm:items-end">
          <div className="space-y-3">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              Desk Score
            </span>
            <strong className="block font-mono text-5xl leading-none">{number(metrics.sharpe_ratio)}</strong>
            <span className="block text-sm leading-6 text-muted-foreground">Sharpe ratio</span>
          </div>
          <div className="grid gap-4 sm:justify-items-end">
            <div className="rounded-[16px] border border-white/8 bg-white/[0.04] px-4 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Replay Return
              </span>
              <strong className="mt-2 block font-mono text-2xl">{percent(metrics.simple_roi)}</strong>
            </div>
            <div className="text-sm leading-6 text-muted-foreground">
              {metrics.open_position_count} open positions tracked against {metrics.benchmark_ticker}.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(19,24,30,0.96),rgba(13,16,21,0.96))]">
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Total Value
          </span>
          <strong className="block font-mono text-3xl leading-none">{currency(metrics.total_value)}</strong>
        </CardContent>
      </Card>

      <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(19,24,30,0.96),rgba(13,16,21,0.96))]">
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Alpha vs {metrics.benchmark_ticker}
          </span>
          <strong className="block font-mono text-3xl leading-none">{percent(metrics.alpha)}</strong>
        </CardContent>
      </Card>

      <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(19,24,30,0.96),rgba(13,16,21,0.96))]">
        <CardContent className="space-y-3 px-6 py-6">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Cash Remaining
          </span>
          <strong className="block font-mono text-3xl leading-none">{currency(metrics.current_cash)}</strong>
        </CardContent>
      </Card>
    </section>
  );
}
