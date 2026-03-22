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
import { BookSummary, WorkspaceComparison } from "../api/client";
import { benchmarkAccent, bookAccent } from "../lib/bookAppearance";
import {
  bookReturn,
  DEFAULT_BENCHMARK_OPTIONS,
  downsampleSeries,
  formatAxisDate,
  formatCurrency,
  formatLongDate,
  formatPercent,
  PLAYBACK_SPEEDS,
  RenderPoint,
  toTimestamp,
  visibleWindowStartIndex,
  ZoomLevel,
  ZOOM_OPTIONS,
} from "../lib/workspaceComparison";
import { PlaybackRate } from "../lib/playback";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import ComparisonOverlayControls from "./ComparisonOverlayControls";
import ComparisonPlaybackControls from "./ComparisonPlaybackControls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

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

    startIndex = visibleWindowStartIndex(timestamps, endIndex, zoom);

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

        <ComparisonOverlayControls
          availableOverlayOptions={availableOverlayOptions}
          customTicker={customTicker}
          onAddOverlayTicker={onAddOverlayTicker}
          onCustomTickerChange={setCustomTicker}
          onRemoveOverlayTicker={onRemoveOverlayTicker}
          onSetPrimaryOverlay={onSetPrimaryOverlay}
          onSubmitOverlayTicker={submitOverlayTicker}
          overlayTickers={overlayTickers}
          primaryBenchmarkTicker={primaryBenchmarkTicker}
        />

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

            <ComparisonPlaybackControls
              comparisonEndDate={comparison?.end_date}
              comparisonStartDate={comparison?.start_date}
              isPlaying={isPlaying}
              onCommitTimelineIndex={() => commitTimelineIndex()}
              onDraftTimelineIndexChange={setDraftIndex}
              onPlayPause={onPlayPause}
              onPlaybackRateChange={onPlaybackRateChange}
              onReset={onReset}
              onZoomChange={setZoom}
              playbackRate={playbackRate}
              points={points}
              primaryBenchmarkTicker={primaryBenchmarkTicker}
              timelineDate={timelinePoint?.date}
              timelineIndex={timelineIndex}
              zoom={zoom}
            />

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
