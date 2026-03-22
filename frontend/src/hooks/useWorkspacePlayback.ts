import { useEffect, useMemo, useState } from "react";

import { BASE_PLAYBACK_INTERVAL_MS, buildPlaybackPath, nextPlaybackIndex, PlaybackRate } from "../lib/playback";

type Props = {
  comparisonDates: string[];
  fallbackSelectedDate: string | null;
  selectedBookId: string | null;
  workspacePhase: "books" | "run";
};

export function useWorkspacePlayback({
  comparisonDates,
  fallbackSelectedDate,
  selectedBookId,
  workspacePhase,
}: Props) {
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [requestedSnapshotDate, setRequestedSnapshotDate] = useState<string | null>(null);

  const comparisonPointCount = comparisonDates.length;
  const clampedDateIndex = comparisonPointCount ? Math.min(selectedDateIndex, comparisonPointCount - 1) : 0;
  const playbackPath = useMemo(() => buildPlaybackPath(comparisonPointCount), [comparisonPointCount]);
  const selectedDate = comparisonDates[clampedDateIndex] ?? fallbackSelectedDate;

  function resetPlayback() {
    setSelectedDateIndex(0);
    setIsPlaying(false);
    setRequestedSnapshotDate(null);
  }

  function selectDateIndex(index: number) {
    const max = Math.max(comparisonPointCount - 1, 0);
    const next = Math.min(Math.max(index, 0), max);
    setSelectedDateIndex(next);
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (!comparisonPointCount) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (clampedDateIndex >= comparisonPointCount - 1) {
      setSelectedDateIndex(0);
    }
    setIsPlaying(comparisonPointCount > 1);
  }

  useEffect(() => {
    if (!comparisonPointCount) {
      setSelectedDateIndex(0);
      setIsPlaying(false);
      return;
    }
    if (selectedDateIndex > comparisonPointCount - 1) {
      setSelectedDateIndex(comparisonPointCount - 1);
    }
  }, [comparisonPointCount, selectedDateIndex]);

  useEffect(() => {
    if (workspacePhase !== "run" || !selectedBookId || !selectedDate) {
      setRequestedSnapshotDate(null);
      return;
    }
    if (isPlaying) {
      return;
    }
    setRequestedSnapshotDate(selectedDate);
  }, [isPlaying, selectedBookId, selectedDate, workspacePhase]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    if (comparisonPointCount <= 1) {
      setIsPlaying(false);
      return;
    }

    const nextIndex = nextPlaybackIndex(playbackPath, clampedDateIndex);
    if (nextIndex === null) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setSelectedDateIndex(nextIndex);
    }, BASE_PLAYBACK_INTERVAL_MS / playbackRate);

    return () => window.clearTimeout(timer);
  }, [clampedDateIndex, comparisonPointCount, isPlaying, playbackPath, playbackRate]);

  return {
    clampedDateIndex,
    isPlaying,
    playbackRate,
    requestedSnapshotDate,
    resetPlayback,
    selectDateIndex,
    setPlaybackRate,
    togglePlayback,
  };
}
