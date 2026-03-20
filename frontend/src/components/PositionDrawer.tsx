import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, PositionWithMetrics } from "../api/client";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Props = {
  position: PositionWithMetrics | null;
  onClose: () => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function percent(value: number | null) {
  if (value === null) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

export default function PositionDrawer({ position, onClose }: Props) {
  const queryClient = useQueryClient();
  const historyQuery = useQuery({
    queryKey: ["position-history", position?.ticker, position?.entry_date, position?.exit_date],
    queryFn: () =>
      api.getMarketHistory(
        position!.ticker,
        position!.entry_date,
        position!.exit_date ?? new Date().toISOString().slice(0, 10),
      ),
    enabled: Boolean(position),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.updatePosition(position!.id, { close: true }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio", position?.portfolio_id] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio-timeseries", position?.portfolio_id] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio-allocation", position?.portfolio_id] }),
        queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
      ]);
      onClose();
    },
  });

  if (!position) {
    return null;
  }

  return (
    <aside className="fixed inset-y-4 right-4 z-50 w-[min(430px,calc(100vw-2rem))] overflow-y-auto">
      <Card className="border-primary/10 bg-card/95">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle>{position.ticker}</CardTitle>
            <p className="text-sm capitalize text-muted-foreground">{position.asset_type} position detail</p>
          </div>
          <Button onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Current Value
              </span>
              <strong className="mt-2 block text-xl">{money.format(position.current_value)}</strong>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Position Sharpe
              </span>
              <strong className="mt-2 block text-xl">
                {position.sharpe_ratio === null ? "n/a" : position.sharpe_ratio.toFixed(2)}
              </strong>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                ROI
              </span>
              <strong className="mt-2 block text-xl">{percent(position.simple_roi)}</strong>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Annualized
              </span>
              <strong className="mt-2 block text-xl">{percent(position.annualized_return)}</strong>
            </div>
          </div>

          <div className="h-[220px] rounded-[28px] border border-border/70 bg-background/70 p-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historyQuery.data ?? []}>
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => money.format(value)}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <Tooltip formatter={(value: number) => money.format(value)} />
                <Line dataKey="close" stroke="hsl(var(--chart-rust))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <dl className="grid gap-4">
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Entry</dt>
              <dd className="mt-2 text-sm leading-6">
                {money.format(position.entry_price)} on {position.entry_date}
              </dd>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Exit</dt>
              <dd className="mt-2 text-sm leading-6">
                {position.exit_price ? `${money.format(position.exit_price)} on ${position.exit_date}` : "Open"}
              </dd>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</dt>
              <dd className="mt-2 text-sm leading-6">{position.notes || "None"}</dd>
            </div>
          </dl>
          {position.status === "open" ? (
            <Button className="w-full" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
              {closeMutation.isPending ? "Closing..." : "Close Position"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
