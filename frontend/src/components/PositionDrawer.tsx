import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, PositionWithMetrics } from "../api/client";

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
    <aside className="drawer">
      <div className="panel-header">
        <div>
          <h2>{position.ticker}</h2>
          <p>{position.asset_type} position detail</p>
        </div>
        <button className="ghost-button" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Current Value</span>
          <strong>{money.format(position.current_value)}</strong>
        </div>
        <div>
          <span className="detail-label">Position Sharpe</span>
          <strong>{position.sharpe_ratio === null ? "n/a" : position.sharpe_ratio.toFixed(2)}</strong>
        </div>
        <div>
          <span className="detail-label">ROI</span>
          <strong>{percent(position.simple_roi)}</strong>
        </div>
        <div>
          <span className="detail-label">Annualized</span>
          <strong>{percent(position.annualized_return)}</strong>
        </div>
      </div>
      <div className="mini-chart">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={historyQuery.data ?? []}>
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(value) => money.format(value)} />
            <Tooltip formatter={(value: number) => money.format(value)} />
            <Line dataKey="close" stroke="#8d493a" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Entry</dt>
          <dd>
            {money.format(position.entry_price)} on {position.entry_date}
          </dd>
        </div>
        <div>
          <dt>Exit</dt>
          <dd>
            {position.exit_price ? `${money.format(position.exit_price)} on ${position.exit_date}` : "Open"}
          </dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{position.notes || "None"}</dd>
        </div>
      </dl>
      {position.status === "open" ? (
        <button className="primary-button" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
          {closeMutation.isPending ? "Closing..." : "Close Position"}
        </button>
      ) : null}
    </aside>
  );
}

