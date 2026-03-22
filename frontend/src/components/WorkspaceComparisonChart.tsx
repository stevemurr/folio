import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pause, Play, Plus, RotateCcw, Star, X } from "lucide-react";

import { BookSummary, WorkspaceComparison } from "../api/client";
import { benchmarkAccent, bookAccent } from "../lib/bookAppearance";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type PlaybackRate = 0.5 | 1 | 2 | 4;
type ZoomLevel = "all" | "10y" | "5y" | "1y";
type RenderPoint = Record<string, number | string | null> & {
  date: string;
  pointIndex: number;
};

type Props = {
  books: BookSummary[];
  comparison: WorkspaceComparison | null;
  isPlaying: boolean;
  onAddOverlayTicker: (ticker: string) => void;
  onPlaybackRateChange: (rate: PlaybackRate) => void;
  onPlayPause: () => void;
  onRemoveOverlayTicker: (ticker: string) => void;
  onReset: () => void;
  onSelectBook: (bookId: string) => void;
  onSelectDateIndex: (index: number) => void;
  onSetPrimaryOverlay: (ticker: string) => void;
  overlayTickers: string[];
  playbackRate: PlaybackRate;
  primaryBenchmarkTicker: string | null;
  selectedBookId: string | null;
  selectedDateIndex: number;
};

const PLAYBACK_SPEEDS: PlaybackRate[] = [0.5, 1, 2, 4];
const DEFAULT_BENCHMARK_OPTIONS = ["SPY", "QQQ", "VTI", "DIA", "IWM", "TLT", "GLD"];
const DAY_MS = 24 * 60 * 60 * 1000;
const ZOOM_OPTIONS: Array<{
  curve: "linear" | "monotone";
  days: number | null;
  id: ZoomLevel;
  label: string;
  maxPoints: number;
}> = [
  { id: "all", label: "All", days: null, maxPoints: 240, curve: "monotone" },
  { id: "10y", label: "10Y", days: 3650, maxPoints: 320, curve: "monotone" },
  { id: "5y", label: "5Y", days: 1825, maxPoints: 420, curve: "monotone" },
  { id: "1y", label: "1Y", days: 365, maxPoints: 700, curve: "linear" },
];

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatAxisDate(value: string, zoom: ZoomLevel) {
  const date = new Date(`${value}T00:00:00`);
  if (zoom === "1y") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatLongDate(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function bookReturn(value: number | undefined, initialCash: number) {
  if (value === undefined) {
    return null;
  }
  return initialCash > 0 ? value / initialCash - 1 : null;
}

function toTimestamp(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function downsampleSeries(points: RenderPoint[], maxPoints: number) {
  if (points.length <= maxPoints) {
    return points;
  }

  const lastIndex = points.length - 1;
  const step = lastIndex / (maxPoints - 1);
  const sampled: RenderPoint[] = [];

  for (let index = 0; index < maxPoints; index += 1) {
    const point = points[Math.round(index * step)];
    if (!sampled.length || sampled[sampled.length - 1].pointIndex !== point.pointIndex) {
      sampled.push(point);
    }
  }

  if (sampled[sampled.length - 1]?.pointIndex !== points[lastIndex].pointIndex) {
    sampled.push(points[lastIndex]);
  }

  return sampled;
}

export default function WorkspaceComparisonChart({
  books,
  comparison,
  isPlaying,
  onAddOverlayTicker,
  onPlaybackRateChange,
  onPlayPause,
  onRemoveOverlayTicker,
  onReset,
  onSelectBook,
  onSelectDateIndex,
  onSetPrimaryOverlay,
  overlayTickers,
  playbackRate,
  primaryBenchmarkTicker,
  selectedBookId,
  selectedDateIndex,
}: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>("all");
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const [customTicker, setCustomTicker] = useState("");
  const commitTimerRef = useRef<number | null>(null);
  const points = comparison?.points ?? [];
  const clampedIndex = points.length ? Math.min(selectedDateIndex, points.length - 1) : 0;
  const currentPoint = points[clampedIndex] ?? null;
  const timelineIndex = draftIndex ?? clampedIndex;
  const timelinePoint = points[timelineIndex] ?? currentPoint;
  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[0] ?? null;
  const selectedBookValue = selectedBook ? currentPoint?.book_values[selectedBook.id] : null;
  const selectedBookInitialCash = selectedBook?.initial_cash ?? 0;
  const benchmarkSeries = useMemo(() => {
    const deduped = new Map<string, NonNullable<WorkspaceComparison["benchmark_series"]>[number]>();
    for (const series of comparison?.benchmark_series ?? []) {
      const key = `${series.ticker}:${series.initial_cash}`;
      if (!deduped.has(key)) {
        deduped.set(key, series);
      }
    }
    return [...deduped.values()];
  }, [comparison?.benchmark_series]);
  const primaryBenchmarkSeries =
    benchmarkSeries.find(
      (series) =>
        series.ticker === primaryBenchmarkTicker &&
        Math.abs(series.initial_cash - selectedBookInitialCash) < 0.01,
    ) ??
    benchmarkSeries.find((series) => series.ticker === primaryBenchmarkTicker) ??
    benchmarkSeries[0] ??
    null;
  const benchmarkValue = primaryBenchmarkSeries ? currentPoint?.benchmark_values[primaryBenchmarkSeries.key] ?? null : null;
  const zoomOption = ZOOM_OPTIONS.find((option) => option.id === zoom) ?? ZOOM_OPTIONS[0];
  const timestamps = useMemo(() => points.map((point) => toTimestamp(point.date)), [points]);
  const availableOverlayOptions = DEFAULT_BENCHMARK_OPTIONS.filter((ticker) => !overlayTickers.includes(ticker));

  function clearCommitTimer() {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }

  function commitTimelineIndex(index = draftIndex) {
    clearCommitTimer();
    if (typeof index !== "number") {
      setDraftIndex(null);
      return;
    }
    setDraftIndex(null);
    if (index !== clampedIndex) {
      onSelectDateIndex(index);
    }
  }

  useEffect(() => () => clearCommitTimer(), []);

  useEffect(() => {
    if (draftIndex === null) {
      return;
    }
    clearCommitTimer();
    commitTimerRef.current = window.setTimeout(() => {
      commitTimelineIndex(draftIndex);
    }, 150);
    return () => clearCommitTimer();
  }, [draftIndex]);

  const visibleWindow = useMemo(() => {
    if (!points.length) {
      return { data: [] as RenderPoint[], endIndex: 0, startIndex: 0 };
    }

    let startIndex = 0;
    const endIndex = clampedIndex;

    if (zoomOption.days !== null) {
      const cutoff = timestamps[endIndex] - zoomOption.days * DAY_MS;
      startIndex = timestamps.findIndex((timestamp, index) => index <= endIndex && timestamp >= cutoff);
      if (startIndex === -1) {
        startIndex = 0;
      }
    }

    const rawData = points.slice(startIndex, endIndex + 1).map((point, offset) => ({
      ...point.book_values,
      ...point.benchmark_values,
      date: point.date,
      pointIndex: startIndex + offset,
    }));

    return {
      data: downsampleSeries(rawData, zoomOption.maxPoints),
      endIndex,
      startIndex,
    };
  }, [clampedIndex, points, timestamps, zoomOption.days, zoomOption.maxPoints]);

  const chartData = visibleWindow.data;

  function submitOverlayTicker() {
    const normalized = customTicker.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    onAddOverlayTicker(normalized);
    setCustomTicker("");
  }

  return (
    <Card className="surface-panel border-border/80">
      <CardHeader className="gap-5 border-b border-border/60 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Run Simulation</Badge>
              <Badge variant="outline">{books.length} runnable books</Badge>
              <Badge variant="outline">{overlayTickers.length} overlays</Badge>
            </div>
            <div className="space-y-1">
              <CardTitle>Shared replay</CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Books run together. Benchmark overlays are temporary chart lines and repeat per ready collection bankroll.
              </CardDescription>
            </div>
          </div>
        </div>

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
                  onChange={(event) => setCustomTicker(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitOverlayTicker();
                    }
                  }}
                  placeholder="Ticker"
                  value={customTicker}
                />
                <button
                  aria-label="Add overlay ticker"
                  className="rounded-full bg-primary/10 p-1 text-primary transition-colors hover:bg-primary/15"
                  onClick={submitOverlayTicker}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Selected Date
            </span>
            <strong className="mt-2 block text-lg">{formatLongDate(currentPoint?.date ?? comparison?.start_date)}</strong>
          </div>
          <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Selected Book
            </span>
            <strong className="mt-2 block font-mono text-lg">{formatCurrency(selectedBookValue)}</strong>
          </div>
          <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {primaryBenchmarkSeries?.label ?? "Primary Overlay"}
            </span>
            <strong className="mt-2 block font-mono text-lg">{formatCurrency(benchmarkValue)}</strong>
          </div>
          <div className="surface-panel-muted rounded-[18px] border border-border/70 px-4 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Selected Return
            </span>
            <strong className="mt-2 block font-mono text-lg">
              {formatPercent(bookReturn(selectedBookValue ?? undefined, selectedBookInitialCash))}
            </strong>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 pt-6">
        {points.length ? (
          <>
            <div className="surface-chart h-[420px] rounded-[18px] border border-border/70 p-3">
              <ResponsiveContainer height="100%" minWidth={320} width="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 22, left: 0, bottom: 12 }}
                  onClick={(state) => {
                    const payload = state?.activePayload?.[0]?.payload as { pointIndex?: number } | undefined;
                    if (typeof payload?.pointIndex === "number") {
                      onSelectDateIndex(payload.pointIndex);
                    }
                  }}
                >
                  <CartesianGrid stroke="hsla(var(--border),0.65)" strokeDasharray="2 8" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    minTickGap={zoom === "1y" ? 18 : 28}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(value: string) => formatAxisDate(value, zoom)}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(value: number) => formatCurrency(value)}
                    tickLine={false}
                    width={88}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--tooltip-bg)",
                      borderColor: "var(--tooltip-border)",
                      borderRadius: "14px",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(value: string) => formatLongDate(value)}
                  />
                  {books.map((book) => (
                    <Line
                      activeDot={{ r: 4 }}
                      connectNulls
                      dataKey={book.id}
                      dot={false}
                      isAnimationActive={false}
                      key={book.id}
                      name={book.collection_name ? `${book.collection_name} · ${book.name}` : book.name}
                      stroke={bookAccent(book.id).color}
                      strokeLinecap="round"
                      strokeOpacity={book.id === selectedBookId ? 1 : 0.68}
                      strokeWidth={book.id === selectedBookId ? 3 : 2}
                      type={zoomOption.curve}
                    />
                  ))}
                  {benchmarkSeries.map((series) => (
                    <Line
                      connectNulls
                      dataKey={series.key}
                      dot={false}
                      isAnimationActive={false}
                      key={series.key}
                      name={series.label}
                      stroke={benchmarkAccent(series.ticker)}
                      strokeDasharray="8 6"
                      strokeLinecap="round"
                      strokeOpacity={series.ticker === primaryBenchmarkTicker ? 0.92 : 0.55}
                      strokeWidth={series.ticker === primaryBenchmarkTicker ? 2.5 : 1.8}
                      type={zoomOption.curve}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="surface-panel-soft grid gap-4 rounded-[18px] border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Timeline
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Play the shared replay or scrub to inspect one date across every ready collection.
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {primaryBenchmarkTicker ? `Primary overlay: ${primaryBenchmarkTicker}` : "No primary overlay"}
                </div>
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                <div className="flex items-center gap-2">
                  <Button disabled={points.length <= 1} onClick={onPlayPause} variant="secondary">
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  <Button disabled={!points.length} onClick={onReset} variant="ghost">
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </div>

                <div className="flex-1">
                  <input
                    aria-label="Comparison timeline"
                    className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
                    max={Math.max(points.length - 1, 0)}
                    min={0}
                    onBlur={() => commitTimelineIndex()}
                    onChange={(event) => setDraftIndex(Number(event.target.value))}
                    onKeyUp={() => commitTimelineIndex()}
                    onMouseUp={() => commitTimelineIndex()}
                    onTouchEnd={() => commitTimelineIndex()}
                    type="range"
                    value={timelineIndex}
                  />
                </div>

                <div className="surface-panel-muted min-w-[12rem] rounded-[16px] border border-border/70 px-4 py-3 text-left xl:text-right">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Playback Head
                  </span>
                  <strong className="mt-1 block text-sm">{formatLongDate(timelinePoint?.date ?? comparison?.start_date)}</strong>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground xl:min-w-[22rem]">
                  <span>{formatLongDate(points[0]?.date ?? comparison?.start_date)}</span>
                  <span>{formatLongDate(points[points.length - 1]?.date ?? comparison?.end_date)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Speed
                    </span>
                    {PLAYBACK_SPEEDS.map((rate) => (
                      <button
                        aria-label={`Playback speed ${rate}x`}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          playbackRate === rate
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-border/70 bg-card/65 text-muted-foreground hover:text-foreground",
                        )}
                        key={rate}
                        onClick={() => onPlaybackRateChange(rate)}
                        type="button"
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Zoom
                    </span>
                    {ZOOM_OPTIONS.map((option) => (
                      <button
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          zoom === option.id
                            ? "border-secondary/25 bg-secondary/10 text-secondary"
                            : "border-border/70 bg-card/65 text-muted-foreground hover:text-foreground",
                        )}
                        key={option.id}
                        onClick={() => setZoom(option.id)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {books.map((book) => {
                const value = currentPoint?.book_values[book.id];
                const active = book.id === selectedBookId;
                const accent = bookAccent(book.id);
                return (
                  <button
                    className={cn(
                      "rounded-[18px] border px-4 py-4 text-left transition-all",
                      active ? "bg-card/92" : "border-border/70 bg-card/60 hover:bg-card/85",
                    )}
                    key={book.id}
                    onClick={() => onSelectBook(book.id)}
                    style={
                      active
                        ? { borderColor: accent.ring, boxShadow: `0 0 0 1px ${accent.ring}` }
                        : undefined
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {book.collection_name ?? "Collection"}
                        </span>
                        <strong className="mt-2 block text-base">{book.name}</strong>
                        <span className="mt-1 block text-sm text-muted-foreground">{book.description}</span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="mt-1 h-3 w-3 rounded-full"
                        style={{ backgroundColor: accent.color }}
                      />
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <strong className="font-mono text-2xl">{formatCurrency(value)}</strong>
                      <span
                        className={cn(
                          "font-mono text-sm font-semibold",
                          (bookReturn(value, book.initial_cash) ?? 0) >= 0 ? "text-emerald-400" : "text-destructive",
                        )}
                      >
                        {formatPercent(bookReturn(value, book.initial_cash))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="surface-panel-muted grid h-[420px] place-items-center rounded-[18px] border border-dashed border-border/70 px-6 text-center">
            <div className="max-w-lg">
              <p className="text-lg font-semibold">No runnable collections yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Build at least one fully ready collection to start the shared replay.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
