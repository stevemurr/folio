import { Plus, Star, X } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";

type Props = {
  availableOverlayOptions: string[];
  customTicker: string;
  onAddOverlayTicker: (ticker: string) => void;
  onCustomTickerChange: (value: string) => void;
  onRemoveOverlayTicker: (ticker: string) => void;
  onSetPrimaryOverlay: (ticker: string) => void;
  onSubmitOverlayTicker: () => void;
  overlayTickers: string[];
  primaryBenchmarkTicker: string | null;
};

export default function ComparisonOverlayControls({
  availableOverlayOptions,
  customTicker,
  onAddOverlayTicker,
  onCustomTickerChange,
  onRemoveOverlayTicker,
  onSetPrimaryOverlay,
  onSubmitOverlayTicker,
  overlayTickers,
  primaryBenchmarkTicker,
}: Props) {
  return (
    <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Overlays
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overlayTickers.map((ticker) => (
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]",
                  ticker === primaryBenchmarkTicker
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border/70 bg-background/75 text-foreground",
                )}
                key={ticker}
              >
                <button onClick={() => onSetPrimaryOverlay(ticker)} type="button">
                  {ticker}
                </button>
                {ticker === primaryBenchmarkTicker ? <Star className="h-3.5 w-3.5 fill-current" /> : null}
                {overlayTickers.length > 1 ? (
                  <button
                    aria-label={`Remove ${ticker}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemoveOverlayTicker(ticker)}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableOverlayOptions.slice(0, 5).map((ticker) => (
            <button
              className="rounded-full border border-border/70 bg-card/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              key={ticker}
              onClick={() => onAddOverlayTicker(ticker)}
              type="button"
            >
              {ticker}
            </button>
          ))}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-2 py-1.5">
            <Input
              className="h-auto w-24 border-0 bg-transparent px-1 py-0 text-xs font-semibold uppercase tracking-[0.12em] shadow-none focus-visible:ring-0"
              onChange={(event) => onCustomTickerChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmitOverlayTicker();
                }
              }}
              placeholder="Ticker"
              value={customTicker}
            />
            <button
              aria-label="Add overlay ticker"
              className="rounded-full bg-primary/10 p-1 text-primary transition-colors hover:bg-primary/15"
              onClick={onSubmitOverlayTicker}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
