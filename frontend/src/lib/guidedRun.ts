export type PresetAllocation = {
  asset_type: "etf";
  ticker: string;
  weight: number;
};

export type GuidedRunPreset = {
  id: string;
  name: string;
  description: string;
  allocations: PresetAllocation[];
};

export const GUIDED_RUN_INITIAL_CASH = 10_000;

export const GUIDED_RUN_PRESETS: GuidedRunPreset[] = [
  {
    id: "core",
    name: "Core",
    description: "Broad market first, growth second, with ballast.",
    allocations: [
      { ticker: "VTI", asset_type: "etf", weight: 60 },
      { ticker: "QQQ", asset_type: "etf", weight: 20 },
      { ticker: "TLT", asset_type: "etf", weight: 10 },
      { ticker: "GLD", asset_type: "etf", weight: 10 },
    ],
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "A steadier mix with more duration and hard-asset cover.",
    allocations: [
      { ticker: "VTI", asset_type: "etf", weight: 40 },
      { ticker: "QQQ", asset_type: "etf", weight: 10 },
      { ticker: "TLT", asset_type: "etf", weight: 35 },
      { ticker: "GLD", asset_type: "etf", weight: 15 },
    ],
  },
  {
    id: "aggressive",
    name: "Aggressive",
    description: "Growth-heavy with just enough defense to keep the line honest.",
    allocations: [
      { ticker: "VTI", asset_type: "etf", weight: 35 },
      { ticker: "QQQ", asset_type: "etf", weight: 50 },
      { ticker: "TLT", asset_type: "etf", weight: 5 },
      { ticker: "GLD", asset_type: "etf", weight: 10 },
    ],
  },
];

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultGuidedRunDate(): string {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 10);
  return formatDateInput(value);
}

export function presetById(presetId: string): GuidedRunPreset {
  return GUIDED_RUN_PRESETS.find((preset) => preset.id === presetId) ?? GUIDED_RUN_PRESETS[0];
}

export function weightsForPreset(preset: GuidedRunPreset): Record<string, string> {
  return Object.fromEntries(preset.allocations.map((allocation) => [allocation.ticker, String(allocation.weight)]));
}
