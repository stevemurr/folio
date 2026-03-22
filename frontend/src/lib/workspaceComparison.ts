import { PlaybackRate } from "./playback";

export type ZoomLevel = "all" | "10y" | "5y" | "1y";
export type RenderPoint = Record<string, number | string | null> & {
  date: string;
  pointIndex: number;
};

export const PLAYBACK_SPEEDS: PlaybackRate[] = [0.5, 1, 2, 4];
export const DEFAULT_BENCHMARK_OPTIONS = ["SPY", "QQQ", "VTI", "DIA", "IWM", "TLT", "GLD"];
const DAY_MS = 24 * 60 * 60 * 1000;

export const ZOOM_OPTIONS: Array<{
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

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
}

export function formatAxisDate(value: string, zoom: ZoomLevel) {
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

export function formatLongDate(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function bookReturn(value: number | undefined, initialCash: number) {
  if (value === undefined) {
    return null;
  }
  return initialCash > 0 ? value / initialCash - 1 : null;
}

export function toTimestamp(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

export function downsampleSeries(points: RenderPoint[], maxPoints: number) {
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

export function visibleWindowStartIndex(timestamps: number[], endIndex: number, zoom: ZoomLevel) {
  const zoomOption = ZOOM_OPTIONS.find((option) => option.id === zoom) ?? ZOOM_OPTIONS[0];
  if (zoomOption.days === null) {
    return 0;
  }

  const cutoff = timestamps[endIndex] - zoomOption.days * DAY_MS;
  const startIndex = timestamps.findIndex((timestamp, index) => index <= endIndex && timestamp >= cutoff);
  return startIndex === -1 ? 0 : startIndex;
}
