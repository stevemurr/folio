import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";

import { AllocationSlice, PositionWithMetrics } from "../api/client";
import { cn } from "../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type SortKey =
  | "ticker"
  | "current_value"
  | "dollar_pnl"
  | "simple_roi"
  | "annualized_return"
  | "sharpe_ratio"
  | "weight";

type Props = {
  allocation: AllocationSlice[];
  positions: PositionWithMetrics[];
  onSelect: (position: PositionWithMetrics) => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function percent(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function sharpeTone(value: number | null) {
  if (value === null) return "text-muted-foreground";
  if (value < 0) return "text-destructive";
  if (value < 1) return "text-amber-400";
  if (value < 2) return "text-emerald-400";
  return "text-secondary";
}

export default function PositionsTable({ allocation, positions, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [descending, setDescending] = useState(true);
  const allocationSnapshot = useMemo(
    () => [...allocation].sort((left, right) => right.weight - left.weight).slice(0, 5),
    [allocation],
  );

  const sorted = useMemo(() => {
    const clone = [...positions];
    clone.sort((a, b) => {
      const left = a[sortKey] ?? -Infinity;
      const right = b[sortKey] ?? -Infinity;
      if (typeof left === "string" && typeof right === "string") {
        return descending ? right.localeCompare(left) : left.localeCompare(right);
      }
      return descending ? Number(right) - Number(left) : Number(left) - Number(right);
    });
    return clone;
  }, [descending, positions, sortKey]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(nextKey);
    setDescending(true);
  }

  function sortButton(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        className={cn(
          "inline-flex items-center gap-1 font-semibold transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => updateSort(key)}
        type="button"
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(18,23,29,0.98),rgba(13,16,21,0.98))]">
      <CardHeader className="gap-4 border-b border-white/6 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <CardTitle>Holdings</CardTitle>
          <CardDescription>Sortable live metrics for simulated positions and current allocation.</CardDescription>
        </div>
        <div className="space-y-2 lg:max-w-[28rem] lg:text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Allocation Snapshot
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {allocationSnapshot.map((slice) => (
              <div className="rounded-[12px] border border-white/6 bg-white/[0.03] px-3 py-2 text-xs font-medium text-foreground" key={slice.ticker}>
                <span className="font-semibold">{slice.label}</span>{" "}
                <span className="font-mono text-muted-foreground">{(slice.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {!positions.length ? (
          <div className="grid min-h-[240px] place-items-center rounded-[18px] border border-dashed border-white/6 bg-background/45 px-6 text-center">
            <div className="max-w-md">
              <p className="text-lg font-semibold">No positions on the desk yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add a stock or ETF to start the replay and populate the holdings view.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-white/6 bg-background/45">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-white/6 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-4 py-3">{sortButton("Ticker", "ticker")}</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Shares</th>
                  <th className="px-4 py-3">Entry</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">{sortButton("ROI", "simple_roi")}</th>
                  <th className="px-4 py-3">{sortButton("Ann.", "annualized_return")}</th>
                  <th className="px-4 py-3">{sortButton("Sharpe", "sharpe_ratio")}</th>
                  <th className="px-4 py-3">{sortButton("Weight", "weight")}</th>
                  <th className="px-4 py-3">{sortButton("P&L", "dollar_pnl")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((position) => (
                  <tr
                    className="cursor-pointer border-t border-white/6 transition-colors hover:bg-white/[0.04]"
                    key={position.id}
                    onClick={() => onSelect(position)}
                  >
                    <td className="px-4 py-4">
                      <div>
                        <strong className="block text-base">{position.ticker}</strong>
                        <span className="mt-1 block font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {position.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 capitalize">{position.asset_type}</td>
                    <td className="px-4 py-4 font-mono">{position.shares.toFixed(3)}</td>
                    <td className="px-4 py-4 font-mono">{money.format(position.entry_price)}</td>
                    <td className="px-4 py-4 font-mono">{money.format(position.current_price)}</td>
                    <td
                      className={cn(
                        "px-4 py-4 font-mono font-semibold",
                        position.simple_roi >= 0 ? "text-emerald-400" : "text-destructive",
                      )}
                    >
                      {percent(position.simple_roi)}
                    </td>
                    <td className="px-4 py-4 font-mono">{percent(position.annualized_return)}</td>
                    <td className={cn("px-4 py-4 font-mono font-semibold", sharpeTone(position.sharpe_ratio))}>
                      {position.sharpe_ratio === null ? "n/a" : position.sharpe_ratio.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 font-mono">{percent(position.weight)}</td>
                    <td
                      className={cn(
                        "px-4 py-4 font-mono font-semibold",
                        position.dollar_pnl >= 0 ? "text-emerald-400" : "text-destructive",
                      )}
                    >
                      {money.format(position.dollar_pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
