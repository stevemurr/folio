import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiClientError,
  BookCreateRequest,
  WorkspaceSummary,
  WorkspaceUpdateRequest,
  WorkspaceView,
  api,
} from "./api/client";
import AgentSidebar from "./components/AgentSidebar";
import BookSnapshotPanel from "./components/BookSnapshotPanel";
import CreateBookModal from "./components/CreateBookModal";
import CreateWorkspaceSetup from "./components/CreateWorkspaceSetup";
import SettingsModal from "./components/SettingsModal";
import WorkspaceBooksPhase from "./components/WorkspaceBooksPhase";
import WorkspaceBrowser from "./components/WorkspaceBrowser";
import WorkspaceComparisonChart from "./components/WorkspaceComparisonChart";
import WorkspaceHero from "./components/WorkspaceHero";
import { Card, CardContent } from "./components/ui/card";
import { useAppSettings, useBookSnapshot, useBootstrap, useWorkspaceView, useWorkspaces } from "./hooks/usePortfolio";
import { defaultGuidedRunDate } from "./lib/guidedRun";

type PlaybackRate = 0.5 | 1 | 2 | 4;
type WorkspacePhase = "books" | "run";
type WorkspaceScreen = "create" | "browser" | "workspace";
type BookModalMode = "create" | "edit";

const BASE_PLAYBACK_INTERVAL_MS = 180;
const MAX_PLAYBACK_STEPS = 180;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.detail.message;
  }
  return fallback;
}

function buildPlaybackPath(length: number): number[] {
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

function nextPlaybackIndex(path: number[], currentIndex: number): number | null {
  for (const index of path) {
    if (index > currentIndex) {
      return index;
    }
  }
  return null;
}

function workspaceSummaryFromView(view: WorkspaceView): WorkspaceSummary {
  return {
    id: view.workspace.id,
    name: view.workspace.name,
    start_date: view.workspace.start_date,
    created_at: view.workspace.created_at,
    book_count: view.books.length,
  };
}

function removeBookFromWorkspaceView(view: WorkspaceView, bookId: string): WorkspaceView {
  const books = view.books.filter((book) => book.id !== bookId);
  const benchmarkTickers = view.comparison.benchmark_tickers;
  if (!books.length) {
    return {
      ...view,
      workspace: { ...view.workspace, book_count: 0 },
      books: [],
      comparison: {
        ...view.comparison,
        start_date: view.workspace.start_date,
        end_date: view.workspace.start_date,
        points: [],
        benchmark_tickers: benchmarkTickers,
      },
    };
  }

  return {
    ...view,
    workspace: { ...view.workspace, book_count: books.length },
    books,
    comparison: {
      ...view.comparison,
      points: view.comparison.points.map((point) => ({
        ...point,
        book_values: Object.fromEntries(Object.entries(point.book_values).filter(([key]) => key !== bookId)),
      })),
    },
  };
}

export default function App() {
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap();
  const settingsQuery = useAppSettings();
  const workspacesQuery = useWorkspaces();

  const [screen, setScreen] = useState<WorkspaceScreen>("create");
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("books");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [workspaceStartDate, setWorkspaceStartDate] = useState(defaultGuidedRunDate());
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookModalMode, setBookModalMode] = useState<BookModalMode>("create");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [requestedSnapshotDate, setRequestedSnapshotDate] = useState<string | null>(null);

  const workspaceViewQuery = useWorkspaceView(selectedWorkspaceId);
  const workspaceView = workspaceViewQuery.data ?? null;
  const selectedWorkspace = workspaceView?.workspace ?? null;
  const books = workspaceView?.books ?? [];
  const comparison = workspaceView?.comparison ?? null;
  const comparisonPoints = comparison?.points ?? [];
  const clampedDateIndex = comparisonPoints.length ? Math.min(selectedDateIndex, comparisonPoints.length - 1) : 0;
  const selectedDate = comparisonPoints[clampedDateIndex]?.date ?? selectedWorkspace?.start_date ?? null;
  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId],
  );
  const snapshotQuery = useBookSnapshot(selectedBookId, requestedSnapshotDate);
  const playbackPath = useMemo(() => buildPlaybackPath(comparisonPoints.length), [comparisonPoints.length]);
  const agentConfigured = Boolean(bootstrapQuery.data?.capabilities.agent);

  const bookConfigQuery = useQuery({
    queryKey: ["book-config", editingBookId],
    queryFn: ({ signal }) => api.getBookConfig(editingBookId!, signal),
    enabled: showBookModal && bookModalMode === "edit" && Boolean(editingBookId),
    staleTime: 5 * 60 * 1000,
  });

  function resetPlayback() {
    setSelectedDateIndex(0);
    setIsPlaying(false);
    setRequestedSnapshotDate(null);
  }

  function openWorkspaceCreate() {
    setWorkspaceError(null);
    setScreen("create");
  }

  function openWorkspaceBrowser() {
    setWorkspaceError(null);
    setScreen("browser");
  }

  function selectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    setSelectedBookId(null);
    setWorkspacePhase("books");
    resetPlayback();
    setScreen("workspace");
  }

  function openCreateBookModal() {
    setBookError(null);
    setBookModalMode("create");
    setEditingBookId(null);
    setShowBookModal(true);
  }

  function openEditBookModal(bookId: string) {
    setBookError(null);
    setBookModalMode("edit");
    setEditingBookId(bookId);
    setShowBookModal(true);
  }

  function closeBookModal() {
    setShowBookModal(false);
    setBookError(null);
    setBookModalMode("create");
    setEditingBookId(null);
  }

  function enterRunPhase() {
    if (!books.length) {
      return;
    }
    setWorkspacePhase("run");
    resetPlayback();
  }

  function returnToBooksPhase() {
    setWorkspacePhase("books");
    resetPlayback();
  }

  function selectDateIndex(index: number) {
    const max = Math.max(comparisonPoints.length - 1, 0);
    const next = Math.min(Math.max(index, 0), max);
    setSelectedDateIndex(next);
    setIsPlaying(false);
  }

  function selectBook(bookId: string) {
    setSelectedBookId(bookId);
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (!comparisonPoints.length) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (clampedDateIndex >= comparisonPoints.length - 1) {
      setSelectedDateIndex(0);
    }
    setIsPlaying(comparisonPoints.length > 1);
  }

  function deleteSelectedWorkspace() {
    if (!selectedWorkspaceId) {
      return;
    }
    if (!window.confirm("Delete this workspace and all of its books?")) {
      return;
    }
    deleteWorkspaceMutation.mutate();
  }

  function deleteBook(bookId: string) {
    if (!window.confirm("Delete this book from the workspace?")) {
      return;
    }
    deleteBookMutation.mutate(bookId);
  }

  function applyWorkspaceViewUpdate(updated: WorkspaceView) {
    queryClient.setQueryData(["workspace-view", updated.workspace.id], updated);
    queryClient.setQueryData<WorkspaceSummary[]>(["workspaces"], (current) => {
      const next = current ?? [];
      const summary = workspaceSummaryFromView(updated);
      return [...next.filter((workspaceItem) => workspaceItem.id !== summary.id), summary];
    });
  }

  function applyBookMutationSuccess(created: { book: { id: string }; workspace_view: WorkspaceView; snapshot: { as_of: string } }) {
    setBookError(null);
    closeBookModal();
    setSelectedBookId(created.book.id);
    setWorkspacePhase("books");
    resetPlayback();
    applyWorkspaceViewUpdate(created.workspace_view);
    queryClient.setQueryData(["book-snapshot", created.book.id, created.snapshot.as_of], created.snapshot);
    setScreen("workspace");
  }

  function updateWorkspace(payload: WorkspaceUpdateRequest) {
    if (!selectedWorkspaceId) {
      return;
    }
    updateWorkspaceMutation.mutate(payload);
  }

  function addBenchmark(ticker: string) {
    if (!selectedWorkspace) {
      return;
    }
    const normalized = ticker.trim().toUpperCase();
    if (!normalized || selectedWorkspace.benchmarks.some((item) => item.ticker === normalized)) {
      return;
    }
    updateWorkspace({
      benchmark_tickers: [...selectedWorkspace.benchmarks.map((item) => item.ticker), normalized],
      primary_benchmark_ticker: selectedWorkspace.benchmarks.find((item) => item.is_primary)?.ticker ?? normalized,
    });
  }

  function removeBenchmark(ticker: string) {
    if (!selectedWorkspace) {
      return;
    }
    const nextTickers = selectedWorkspace.benchmarks.map((item) => item.ticker).filter((item) => item !== ticker);
    if (!nextTickers.length) {
      return;
    }
    const currentPrimary = selectedWorkspace.benchmarks.find((item) => item.is_primary)?.ticker;
    updateWorkspace({
      benchmark_tickers: nextTickers,
      primary_benchmark_ticker: currentPrimary === ticker ? nextTickers[0] : currentPrimary,
    });
  }

  function setPrimaryBenchmark(ticker: string) {
    updateWorkspace({ primary_benchmark_ticker: ticker });
  }

  useEffect(() => {
    const workspaceList = workspacesQuery.data ?? [];
    if (!workspaceList.length) {
      if (selectedWorkspaceId) {
        setSelectedWorkspaceId(null);
        setSelectedBookId(null);
        setWorkspacePhase("books");
        resetPlayback();
      }
      setScreen("create");
      return;
    }

    if (selectedWorkspaceId && !workspaceList.some((workspaceItem) => workspaceItem.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(null);
      setSelectedBookId(null);
      setWorkspacePhase("books");
      resetPlayback();
      setScreen("browser");
    }
  }, [selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    if (!books.length) {
      setSelectedBookId(null);
      if (workspacePhase === "run") {
        setWorkspacePhase("books");
      }
      return;
    }
    if (!selectedBookId || !books.some((book) => book.id === selectedBookId)) {
      setSelectedBookId(books[0].id);
    }
  }, [books, selectedBookId, workspacePhase]);

  useEffect(() => {
    if (!comparisonPoints.length) {
      setSelectedDateIndex(0);
      setIsPlaying(false);
      return;
    }
    if (selectedDateIndex > comparisonPoints.length - 1) {
      setSelectedDateIndex(comparisonPoints.length - 1);
    }
  }, [comparisonPoints.length, selectedDateIndex]);

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
    if (comparisonPoints.length <= 1) {
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
  }, [clampedDateIndex, comparisonPoints.length, isPlaying, playbackPath, playbackRate]);

  const createWorkspaceMutation = useMutation({
    mutationFn: () => api.createWorkspace({ start_date: workspaceStartDate }),
    onSuccess: (created) => {
      setWorkspaceError(null);
      setWorkspaceStartDate(defaultGuidedRunDate());
      applyWorkspaceViewUpdate(created);
      selectWorkspace(created.workspace.id);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to create workspace."));
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (payload: WorkspaceUpdateRequest) => api.updateWorkspace(selectedWorkspaceId!, payload),
    onSuccess: (updated) => {
      setWorkspaceError(null);
      resetPlayback();
      applyWorkspaceViewUpdate(updated);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to update workspace."));
    },
  });

  const createBookMutation = useMutation({
    mutationFn: (payload: BookCreateRequest) => {
      if (!selectedWorkspaceId || !selectedWorkspace) {
        throw new Error("Select a workspace first.");
      }
      return api.createBook(selectedWorkspaceId, {
        ...payload,
        snapshot_as_of: selectedWorkspace.start_date,
      });
    },
    onSuccess: applyBookMutationSuccess,
    onError: (error) => {
      setBookError(errorMessage(error, "Unable to create book."));
    },
  });

  const updateBookMutation = useMutation({
    mutationFn: (payload: BookCreateRequest) => {
      if (!editingBookId) {
        throw new Error("Select a book to edit.");
      }
      return api.updateBook(editingBookId, payload);
    },
    onSuccess: applyBookMutationSuccess,
    onError: (error) => {
      setBookError(errorMessage(error, "Unable to update book."));
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => api.deleteWorkspace(selectedWorkspaceId!),
    onSuccess: () => {
      const deletedWorkspaceId = selectedWorkspaceId;
      const currentWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(["workspaces"]) ?? [];
      const remainingWorkspaces = deletedWorkspaceId
        ? currentWorkspaces.filter((workspaceItem) => workspaceItem.id !== deletedWorkspaceId)
        : currentWorkspaces;

      setSelectedWorkspaceId(null);
      setSelectedBookId(null);
      setWorkspacePhase("books");
      resetPlayback();
      setShowAgentDrawer(false);
      setScreen(remainingWorkspaces.length ? "browser" : "create");

      if (deletedWorkspaceId) {
        queryClient.setQueryData(["workspaces"], remainingWorkspaces);
        queryClient.removeQueries({ queryKey: ["workspace-view", deletedWorkspaceId] });
      }
      queryClient.removeQueries({ queryKey: ["book-snapshot"] });
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: (bookId: string) => api.deleteBook(bookId),
    onSuccess: (_, deletedBookId) => {
      setWorkspacePhase("books");
      resetPlayback();
      setShowAgentDrawer(false);
      if (selectedBookId === deletedBookId) {
        setSelectedBookId(null);
      }
      if (selectedWorkspaceId) {
        const currentView = queryClient.getQueryData<WorkspaceView>(["workspace-view", selectedWorkspaceId]);
        if (currentView) {
          const updatedView = removeBookFromWorkspaceView(currentView, deletedBookId);
          applyWorkspaceViewUpdate(updatedView);
        }
      }
      queryClient.removeQueries({ queryKey: ["book-snapshot", deletedBookId] });
    },
  });

  const loadingState =
    bootstrapQuery.isLoading ||
    settingsQuery.isLoading ||
    workspacesQuery.isLoading ||
    (selectedWorkspaceId ? workspaceViewQuery.isLoading : false);

  return (
    <>
      <div className="app-shell min-h-screen">
        <div className="mx-auto max-w-[1680px] px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
          {screen === "create" ? (
            <div className="grid min-h-screen content-start gap-6 py-4 lg:py-10">
              <div className="mx-auto grid w-full max-w-[1120px] gap-6">
                <CreateWorkspaceSetup
                  error={workspaceError}
                  onChange={setWorkspaceStartDate}
                  onOpenBrowser={workspacesQuery.data?.length ? openWorkspaceBrowser : undefined}
                  onOpenSettings={() => setShowSettingsModal(true)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    createWorkspaceMutation.mutate();
                  }}
                  pending={createWorkspaceMutation.isPending}
                  savedCount={workspacesQuery.data?.length ?? 0}
                  settingsDisabled={settingsQuery.isLoading || settingsQuery.isError}
                  startDate={workspaceStartDate}
                />
              </div>
            </div>
          ) : screen === "browser" ? (
            <div className="grid min-h-screen content-start gap-6 py-4 lg:py-10">
              <div className="mx-auto grid w-full max-w-[1120px] gap-6">
                <WorkspaceBrowser
                  loading={workspacesQuery.isLoading}
                  onCreateWorkspace={openWorkspaceCreate}
                  onOpenSettings={() => setShowSettingsModal(true)}
                  onPickWorkspace={selectWorkspace}
                  onReturnToWorkspace={selectedWorkspaceId ? () => setScreen("workspace") : undefined}
                  selectedWorkspaceId={selectedWorkspaceId}
                  settingsDisabled={settingsQuery.isLoading || settingsQuery.isError}
                  workspaces={workspacesQuery.data ?? []}
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-[1440px] content-start gap-4">
              {selectedWorkspace ? (
                <WorkspaceHero
                  agentConfigured={agentConfigured}
                  booksCount={books.length}
                  onAddBenchmark={addBenchmark}
                  onDeleteWorkspace={deleteSelectedWorkspace}
                  onOpenAnalysis={() => setShowAgentDrawer(true)}
                  onOpenBrowser={openWorkspaceBrowser}
                  onOpenSettings={() => setShowSettingsModal(true)}
                  onReturnToBooks={returnToBooksPhase}
                  onRunSimulation={enterRunPhase}
                  onSaveBankroll={(nextValue) => updateWorkspace({ initial_cash: nextValue })}
                  onSetPrimaryBenchmark={setPrimaryBenchmark}
                  onRemoveBenchmark={removeBenchmark}
                  pendingWorkspaceUpdate={updateWorkspaceMutation.isPending}
                  phase={workspacePhase}
                  settingsDisabled={settingsQuery.isLoading || settingsQuery.isError}
                  workspace={selectedWorkspace}
                />
              ) : null}

              {workspaceError && screen === "workspace" ? (
                <Card className="border-destructive/20 bg-destructive/10">
                  <CardContent className="px-6 py-4 text-sm text-destructive">{workspaceError}</CardContent>
                </Card>
              ) : null}

              {loadingState ? (
                <Card className="surface-panel border-border/80">
                  <CardContent className="grid min-h-[320px] place-items-center px-6 py-8 text-center text-sm text-muted-foreground">
                    <p>Loading workspace data...</p>
                  </CardContent>
                </Card>
              ) : workspaceViewQuery.isError ? (
                <Card className="surface-panel border-border/80">
                  <CardContent className="grid min-h-[320px] place-items-center px-6 py-8 text-center">
                    <div className="max-w-lg">
                      <p className="text-lg font-semibold">Unable to load this workspace.</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Refresh the page or create a new workspace to continue.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : workspacePhase === "books" ? (
                <WorkspaceBooksPhase
                  books={books}
                  deletePendingBookId={deleteBookMutation.isPending ? (deleteBookMutation.variables ?? null) : null}
                  onAddBook={openCreateBookModal}
                  onDeleteBook={deleteBook}
                  onEditBook={openEditBookModal}
                  onSelectBook={selectBook}
                  selectedBookId={selectedBookId}
                  startDate={selectedWorkspace?.start_date ?? workspaceStartDate}
                />
              ) : (
                <>
                  <WorkspaceComparisonChart
                    benchmarks={selectedWorkspace?.benchmarks ?? []}
                    books={books}
                    comparison={comparison}
                    initialCash={selectedWorkspace?.initial_cash ?? 10000}
                    isPlaying={isPlaying}
                    onPlaybackRateChange={setPlaybackRate}
                    onPlayPause={togglePlayback}
                    onReset={resetPlayback}
                    onSelectBook={selectBook}
                    onSelectDateIndex={selectDateIndex}
                    playbackRate={playbackRate}
                    selectedBookId={selectedBookId}
                    selectedDateIndex={clampedDateIndex}
                  />

                  <BookSnapshotPanel
                    book={selectedBook}
                    error={snapshotQuery.error}
                    loading={snapshotQuery.isLoading || snapshotQuery.isFetching}
                    snapshot={snapshotQuery.data}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <CreateBookModal
        config={bookModalMode === "edit" ? bookConfigQuery.data ?? null : null}
        error={bookError}
        loadingConfig={bookModalMode === "edit" && bookConfigQuery.isLoading}
        mode={bookModalMode}
        onClose={closeBookModal}
        onSubmit={(payload) => {
          if (bookModalMode === "edit") {
            updateBookMutation.mutate(payload);
            return;
          }
          createBookMutation.mutate(payload);
        }}
        open={showBookModal}
        pending={createBookMutation.isPending || updateBookMutation.isPending}
      />

      <AgentSidebar
        bootstrap={
          bootstrapQuery.data ?? {
            benchmark_ticker: "SPY",
            capabilities: { agent: false, real_estate: false },
            risk_free_rate: 0,
          }
        }
        onClose={() => setShowAgentDrawer(false)}
        open={showAgentDrawer}
        portfolioId={selectedBookId}
      />

      <SettingsModal onClose={() => setShowSettingsModal(false)} open={showSettingsModal} settings={settingsQuery.data} />
    </>
  );
}
