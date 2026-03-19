import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, api } from "../api/client";

type Props = {
  open: boolean;
  portfolioId: string;
  onClose: () => void;
};

export default function AddPositionModal({ open, portfolioId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [assetType, setAssetType] = useState<"stock" | "etf">("stock");
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
    queryKey: ["market-search", query],
    queryFn: () => api.searchMarket(query),
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
    <div className="modal-scrim" role="presentation">
      <div className="modal-card">
        <div className="panel-header">
          <div>
            <h2>Add Position</h2>
            <p>Historical entries use the latest trading close on or before the selected date.</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <form className="stack-form" onSubmit={submit}>
          <div className="pill-tabs">
            <button
              className={assetType === "stock" ? "pill active" : "pill"}
              onClick={() => setAssetType("stock")}
              type="button"
            >
              Stock / ETF
            </button>
            <button className="pill disabled" type="button">
              Real Estate Disabled
            </button>
          </div>
          <label>
            Search or ticker
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setTicker("");
              }}
              placeholder="Search NVDA or VTI"
            />
          </label>
          {searchQuery.data?.length ? (
            <div className="search-results">
              {searchQuery.data.map((result) => (
                <button
                  key={result.ticker}
                  className="search-result"
                  onClick={() => {
                    setTicker(result.ticker);
                    setQuery(result.ticker);
                    setAssetType(result.asset_type);
                  }}
                  type="button"
                >
                  <strong>{result.ticker}</strong>
                  <span>{result.name}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="two-up">
            <label>
              Entry date
              <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
            </label>
            <label>
              Shares
              <input
                inputMode="decimal"
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                placeholder="1"
              />
            </label>
          </div>
          <label>
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </label>
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="button-row">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={mutation.isPending} type="submit">
              {mutation.isPending ? "Adding..." : "Add Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

