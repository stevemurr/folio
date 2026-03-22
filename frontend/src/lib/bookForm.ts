import { BookConfig, WorkspaceAvailabilityResponse } from "../api/client";
import { presetById, weightsForPreset } from "./guidedRun";

export type BookFormAllocation = {
  ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  weight: string;
};

export function initialPresetWeights(presetId: string) {
  return weightsForPreset(presetById(presetId));
}

export function parseWeight(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validateWeights(weights: number[]): string | null {
  if (weights.some((weight) => weight < 0)) {
    return "Book weights cannot be negative.";
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight > 100) {
    return "Book weights cannot exceed 100%.";
  }
  if (!weights.some((weight) => weight > 0)) {
    return "Add at least one allocation with weight greater than zero.";
  }
  return null;
}

export function customAllocationsFromConfig(config: BookConfig): BookFormAllocation[] {
  return config.allocations.map((allocation) => ({
    ticker: allocation.ticker,
    name: allocation.ticker,
    asset_type: allocation.asset_type,
    weight: String(allocation.weight),
  }));
}

export function presetWeightsFromConfig(config: BookConfig, presetId: string) {
  const preset = presetById(presetId);
  const weights = initialPresetWeights(presetId);
  for (const allocation of config.allocations) {
    if (preset.allocations.some((item) => item.ticker === allocation.ticker)) {
      weights[allocation.ticker] = String(allocation.weight);
    }
  }
  return weights;
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

export function availabilityMessage(data: WorkspaceAvailabilityResponse | undefined): string | null {
  if (!data) {
    return null;
  }
  if (data.issues.length) {
    return data.issues[0].message;
  }
  const blocked = data.tickers.find((item) => !item.available);
  if (!blocked) {
    return null;
  }
  if (blocked.first_tradable_date) {
    return `${blocked.ticker} first becomes tradable on ${blocked.first_tradable_date}.`;
  }
  return `${blocked.ticker} has no market data for the shared opening session.`;
}
