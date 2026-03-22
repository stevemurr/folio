import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";

export function useWorkspaceView(workspaceId: string | null) {
  const enabled = Boolean(workspaceId);
  return useQuery({
    queryKey: ["workspace-view", workspaceId],
    queryFn: ({ signal }) => api.getWorkspaceView(workspaceId!, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkspaceComparison(
  workspaceId: string | null,
  benchmarkTickers: string[],
  primaryBenchmarkTicker: string | null,
  enabled = true,
) {
  const active = Boolean(workspaceId) && enabled;
  return useQuery({
    queryKey: ["workspace-comparison", workspaceId, benchmarkTickers, primaryBenchmarkTicker],
    queryFn: ({ signal }) =>
      api.getWorkspaceComparison(
        workspaceId!,
        {
          benchmark_tickers: benchmarkTickers,
          primary_benchmark_ticker: primaryBenchmarkTicker,
        },
        signal,
      ),
    enabled: active,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useBookSnapshot(bookId: string | null, asOf: string | null, benchmarkTicker: string | null) {
  const enabled = Boolean(bookId && asOf);
  return useQuery({
    queryKey: ["book-snapshot", bookId, asOf, benchmarkTicker],
    queryFn: ({ signal }) => api.getBookSnapshot(bookId!, asOf!, benchmarkTicker, signal),
    enabled,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.getBootstrap,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: api.getAppSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: api.listWorkspaces,
    staleTime: 5 * 60 * 1000,
  });
}
