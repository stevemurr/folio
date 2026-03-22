import { Pause, Play, RotateCcw } from "lucide-react";

import { PlaybackRate } from "../lib/playback";
import { formatLongDate, PLAYBACK_SPEEDS, ZoomLevel, ZOOM_OPTIONS } from "../lib/workspaceComparison";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  comparisonEndDate: string | null | undefined;
  comparisonStartDate: string | null | undefined;
  isPlaying: boolean;
  onCommitTimelineIndex: () => void;
  onDraftTimelineIndexChange: (index: number) => void;
  onPlayPause: () => void;
  onPlaybackRateChange: (rate: PlaybackRate) => void;
  onReset: () => void;
  onZoomChange: (zoom: ZoomLevel) => void;
  playbackRate: PlaybackRate;
  points: Array<{ date: string }>;
  primaryBenchmarkTicker: string | null;
  timelineDate: string | null | undefined;
  timelineIndex: number;
  zoom: ZoomLevel;
};

export default function ComparisonPlaybackControls({
  comparisonEndDate,
  comparisonStartDate,
  isPlaying,
  onCommitTimelineIndex,
  onDraftTimelineIndexChange,
  onPlayPause,
  onPlaybackRateChange,
  onReset,
  onZoomChange,
  playbackRate,
  points,
  primaryBenchmarkTicker,
  timelineDate,
  timelineIndex,
  zoom,
}: Props) {
  return (
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
            onBlur={onCommitTimelineIndex}
            onChange={(event) => onDraftTimelineIndexChange(Number(event.target.value))}
            onKeyUp={onCommitTimelineIndex}
            onMouseUp={onCommitTimelineIndex}
            onTouchEnd={onCommitTimelineIndex}
            type="range"
            value={timelineIndex}
          />
        </div>

        <div className="surface-panel-muted min-w-[12rem] rounded-[16px] border border-border/70 px-4 py-3 text-left xl:text-right">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Playback Head
          </span>
          <strong className="mt-1 block text-sm">{formatLongDate(timelineDate ?? comparisonStartDate)}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground xl:min-w-[22rem]">
          <span>{formatLongDate(points[0]?.date ?? comparisonStartDate)}</span>
          <span>{formatLongDate(points[points.length - 1]?.date ?? comparisonEndDate)}</span>
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
                onClick={() => onZoomChange(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
