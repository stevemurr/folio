import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, MarketSearchResult, RealEstateSearchResult, api } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type Props = {
  open: boolean;
  portfolioId: string;
  realEstateEnabled: boolean;
  onClose: () => void;
};

type SearchResult = MarketSearchResult | RealEstateSearchResult;

export default function AddPositionModal({ open, portfolioId, realEstateEnabled, onClose }: Props) {
  const queryClient = useQueryClient();
  const [assetType, setAssetType] = useState<"stock" | "etf" | "real_estate">("stock");
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTicker("");
      setNotes("");
      setError(null);
      setAssetType("stock");
      setShares("1");
      setEntryDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const searchQuery = useQuery({
    queryFn: async (): Promise<SearchResult[]> =>
      assetType === "real_estate" ? await api.searchRealEstate(query) : await api.searchMarket(query),
    queryKey: ["market-search", assetType, query],
    enabled: open && query.trim().length >= 1,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.addPosition(portfolioId, {
        asset_type: assetType,
        ticker: ticker || query,
        entry_date: entryDate,
        shares: Number(shares),
        notes,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio-timeseries", portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio-allocation", portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
      ]);
      onClose();
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiClientError) {
        setError(mutationError.detail.message);
      } else {
        setError("Unable to add the position.");
      }
    },
  });

  if (!open) {
    return null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-40 grid place-items-center bg-[rgba(42,28,22,0.42)] p-4 backdrop-blur-sm"
      role="dialog"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle>Add Position</CardTitle>
            <CardDescription>
              Historical entries use the latest trading close on or before the selected date.
            </CardDescription>
          </div>
          <Button onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex flex-wrap gap-2">
              <button
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  assetType !== "real_estate"
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border bg-background/70 text-foreground hover:bg-background",
                )}
                onClick={() => setAssetType("stock")}
                type="button"
              >
                Stock / ETF
              </button>
              <button
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  !realEstateEnabled
                    ? "cursor-not-allowed border-border bg-muted/60 text-muted-foreground"
                    : assetType === "real_estate"
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-border bg-background/70 text-foreground hover:bg-background",
                )}
                disabled={!realEstateEnabled}
                onClick={() => setAssetType("real_estate")}
                type="button"
              >
                {realEstateEnabled ? "Real Estate" : "Real Estate Disabled"}
              </button>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              <span>Search or ticker</span>
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setTicker("");
                }}
                placeholder={assetType === "real_estate" ? "Search Austin, 94105, or Seattle" : "Search NVDA or VTI"}
              />
            </label>
            {searchQuery.data?.length ? (
              <div className="grid gap-2">
                {searchQuery.data.map((result) => (
                  <button
                    key={result.ticker}
                    className="flex items-center justify-between rounded-3xl border border-border/70 bg-background/70 px-4 py-4 text-left transition-colors hover:bg-background"
                    onClick={() => {
                      setTicker(result.ticker);
                      setQuery(result.ticker);
                      setAssetType(result.asset_type);
                    }}
                    type="button"
                  >
                    <div>
                      <strong className="block">{result.ticker}</strong>
                      <span className="mt-1 block text-sm text-muted-foreground">{result.name}</span>
                    </div>
                    <Badge variant="outline">
                      {result.asset_type === "real_estate" ? result.region_type : result.asset_type}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                <span>Entry date</span>
                <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                <span>{assetType === "real_estate" ? "Units" : "Shares"}</span>
                <Input
                  inputMode="decimal"
                  value={shares}
                  onChange={(event) => setShares(event.target.value)}
                  placeholder="1"
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              <span>Notes</span>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
            </label>
            {error ? (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button onClick={onClose} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? "Adding..." : "Add Position"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
