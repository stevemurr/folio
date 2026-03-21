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

export function useBookSnapshot(bookId: string | null, asOf: string | null) {
  const enabled = Boolean(bookId && asOf);
  return useQuery({
    queryKey: ["book-snapshot", bookId, asOf],
    queryFn: ({ signal }) => api.getBookSnapshot(bookId!, asOf!, signal),
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
