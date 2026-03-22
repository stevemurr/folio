import {
  BookConfig,
  BookCreateRequest,
  BookSnapshot,
  BookSummary,
  BookUpdateRequest,
  CollectionCreateRequest,
  CollectionSummary,
  CollectionUpdateRequest,
  WorkspaceAvailabilityResponse,
  WorkspaceComparison,
  WorkspaceComparisonRequest,
  WorkspaceDetail,
  WorkspaceSummary,
  WorkspaceUpdateRequest,
  WorkspaceView,
} from "./types";
import { request } from "./request";

export const workspaceApi = {
  listWorkspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  createWorkspace: (payload: { start_date: string }) =>
    request<WorkspaceDetail>("/workspaces", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspace: (workspaceId: string, payload: WorkspaceUpdateRequest) =>
    request<WorkspaceDetail>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getWorkspace: (workspaceId: string) => request<WorkspaceDetail>(`/workspaces/${workspaceId}`),
  getWorkspaceView: (workspaceId: string, signal?: AbortSignal) =>
    request<WorkspaceView>(`/workspaces/${workspaceId}/view`, { signal }),
  deleteWorkspace: (workspaceId: string) =>
    request<void>(`/workspaces/${workspaceId}`, { method: "DELETE" }),
  createCollection: (workspaceId: string, payload: CollectionCreateRequest) =>
    request<CollectionSummary>(`/workspaces/${workspaceId}/collections`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCollection: (collectionId: string, payload: CollectionUpdateRequest) =>
    request<CollectionSummary>(`/collections/${collectionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCollection: (collectionId: string) =>
    request<void>(`/collections/${collectionId}`, { method: "DELETE" }),
  listBooks: (workspaceId: string) => request<BookSummary[]>(`/workspaces/${workspaceId}/books`),
  createBook: (collectionId: string, payload: BookCreateRequest) =>
    request<BookSummary>(`/collections/${collectionId}/books`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBookConfig: (bookId: string, signal?: AbortSignal) => request<BookConfig>(`/books/${bookId}/config`, { signal }),
  updateBook: (bookId: string, payload: BookUpdateRequest) =>
    request<BookSummary>(`/books/${bookId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBook: (bookId: string) => request<void>(`/books/${bookId}`, { method: "DELETE" }),
  getWorkspaceAvailability: (workspaceId: string, tickers: string[], signal?: AbortSignal) =>
    request<WorkspaceAvailabilityResponse>(`/workspaces/${workspaceId}/availability`, {
      method: "POST",
      signal,
      body: JSON.stringify({ tickers }),
    }),
  getWorkspaceComparison: (workspaceId: string, payload: WorkspaceComparisonRequest, signal?: AbortSignal) =>
    request<WorkspaceComparison>(`/workspaces/${workspaceId}/comparison`, {
      method: "POST",
      signal,
      body: JSON.stringify(payload),
    }),
  getBookSnapshot: (bookId: string, asOf: string, benchmarkTicker?: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ as_of: asOf });
    if (benchmarkTicker) {
      params.set("benchmark_ticker", benchmarkTicker);
    }
    return request<BookSnapshot>(`/books/${bookId}/snapshot?${params.toString()}`, { signal });
  },
};
