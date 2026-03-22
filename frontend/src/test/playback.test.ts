import { describe, expect, it } from "vitest";

import { buildPlaybackPath, nextPlaybackIndex } from "../lib/playback";

describe("playback helpers", () => {
  it("builds a bounded playback path that keeps the first and last points", () => {
    const path = buildPlaybackPath(400);

    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBe(399);
    expect(path.length).toBeLessThanOrEqual(180);
  });

  it("returns the next higher playback index", () => {
    expect(nextPlaybackIndex([0, 5, 10], 5)).toBe(10);
    expect(nextPlaybackIndex([0, 5, 10], 10)).toBeNull();
  });
});
