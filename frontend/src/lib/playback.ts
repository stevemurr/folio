export type PlaybackRate = 0.5 | 1 | 2 | 4;

export const BASE_PLAYBACK_INTERVAL_MS = 180;
const MAX_PLAYBACK_STEPS = 180;

export function buildPlaybackPath(length: number): number[] {
  if (length <= 1) {
    return length ? [0] : [];
  }

  const steps = Math.min(length, MAX_PLAYBACK_STEPS);
  const indices = new Set<number>();
  for (let step = 0; step < steps; step += 1) {
    indices.add(Math.round((step * (length - 1)) / (steps - 1)));
  }

  return [...indices].sort((left, right) => left - right);
}

export function nextPlaybackIndex(path: number[], currentIndex: number): number | null {
  for (const index of path) {
    if (index > currentIndex) {
      return index;
    }
  }
  return null;
}
