import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";

import { PositionWithMetrics } from "../api/client";
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
  if (value < 1) return "text-amber-700";
  if (value < 2) return "text-emerald-700";
  return "text-secondary";
}

export default function PositionsTable({ positions, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [descending, setDescending] = useState(true);

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
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <CardDescription>Sortable live metrics for simulated holdings.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-4 pb-3">{sortButton("Ticker", "ticker")}</th>
                <th className="px-4 pb-3">Type</th>
                <th className="px-4 pb-3">Shares</th>
                <th className="px-4 pb-3">Entry</th>
                <th className="px-4 pb-3">Current</th>
                <th className="px-4 pb-3">{sortButton("ROI", "simple_roi")}</th>
                <th className="px-4 pb-3">{sortButton("Ann.", "annualized_return")}</th>
                <th className="px-4 pb-3">{sortButton("Sharpe", "sharpe_ratio")}</th>
                <th className="px-4 pb-3">{sortButton("Weight", "weight")}</th>
                <th className="px-4 pb-3">{sortButton("P&L", "dollar_pnl")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((position) => (
                <tr
                  className="cursor-pointer transition-colors hover:bg-background/70"
                  key={position.id}
                  onClick={() => onSelect(position)}
                >
                  <td className="rounded-l-3xl border-y border-l border-border/60 bg-card/60 px-4 py-4">
                    <div>
                      <strong className="block text-base">{position.ticker}</strong>
                      <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {position.status}
                      </span>
                    </div>
                  </td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4 capitalize">{position.asset_type}</td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4">{position.shares.toFixed(3)}</td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4">{money.format(position.entry_price)}</td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4">{money.format(position.current_price)}</td>
                  <td
                    className={cn(
                      "border-y border-border/60 bg-card/60 px-4 py-4 font-semibold",
                      position.simple_roi >= 0 ? "text-emerald-700" : "text-destructive",
                    )}
                  >
                    {percent(position.simple_roi)}
                  </td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4">
                    {percent(position.annualized_return)}
                  </td>
                  <td
                    className={cn(
                      "border-y border-border/60 bg-card/60 px-4 py-4 font-semibold",
                      sharpeTone(position.sharpe_ratio),
                    )}
                  >
                    {position.sharpe_ratio === null ? "n/a" : position.sharpe_ratio.toFixed(2)}
                  </td>
                  <td className="border-y border-border/60 bg-card/60 px-4 py-4">{percent(position.weight)}</td>
                  <td
                    className={cn(
                      "rounded-r-3xl border-y border-r border-border/60 bg-card/60 px-4 py-4 font-semibold",
                      position.dollar_pnl >= 0 ? "text-emerald-700" : "text-destructive",
                    )}
                  >
                    {money.format(position.dollar_pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
