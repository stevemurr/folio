import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiClientError, BookCreateRequest, SimulationCreateRequest, WorkspaceSummary, api } from "./api/client";
import CreateWorkspaceSetup from "./components/CreateWorkspaceSetup";
import SimulationsPanel from "./components/SimulationsPanel";
import WorkspaceBooksPhase from "./components/WorkspaceBooksPhase";
import WorkspaceBrowser from "./components/WorkspaceBrowser";
import WorkspaceTopBar from "./components/WorkspaceTopBar";
import { Card, CardContent } from "./components/ui/card";
import {
  useAppSettings,
  useBookSnapshot,
  useBootstrap,
  useWorkspaceComparison,
  useWorkspaceView,
  useWorkspaces,
} from "./hooks/usePortfolio";
import { useWorkspacePlayback } from "./hooks/useWorkspacePlayback";
import { defaultGuidedRunDate } from "./lib/guidedRun";

type WorkspacePhase = "books" | "run" | "simulation-results";
type WorkspaceScreen = "create" | "browser" | "workspace";
type BookModalMode = "create" | "edit";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.detail.message;
  }
  return fallback;
}

const AgentSidebar = lazy(() => import("./components/AgentSidebar"));
const BookSnapshotPanel = lazy(() => import("./components/BookSnapshotPanel"));
const CreateBookModal = lazy(() => import("./components/CreateBookModal"));
const CreateSimulationModal = lazy(() => import("./components/CreateSimulationModal"));
const SettingsModal = lazy(() => import("./components/SettingsModal"));
const SimulationResultsView = lazy(() => import("./components/SimulationResultsView"));
const WorkspaceComparisonChart = lazy(() => import("./components/WorkspaceComparisonChart"));

export default function App() {
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap();
  const settingsQuery = useAppSettings();
  const workspacesQuery = useWorkspaces();

  const [screen, setScreen] = useState<WorkspaceScreen>("browser");
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("books");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [workspaceStartDate, setWorkspaceStartDate] = useState(defaultGuidedRunDate());
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookModalMode, setBookModalMode] = useState<BookModalMode>("create");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [overlayTickers, setOverlayTickers] = useState<string[]>([]);
  const [primaryOverlayTicker, setPrimaryOverlayTicker] = useState<string | null>(null);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [selectedSimAgentId, setSelectedSimAgentId] = useState<string | null>(null);

  const workspaceViewQuery = useWorkspaceView(selectedWorkspaceId);
  const workspaceView = workspaceViewQuery.data ?? null;
  const selectedWorkspace = workspaceView?.workspace ?? null;
  const collections = workspaceView?.collections ?? [];
  const books = useMemo(() => collections.flatMap((collection) => collection.books), [collections]);
  const readyCollections = useMemo(
    () => collections.filter((collection) => collection.run_state.status === "ready"),
    [collections],
  );
  const runnableBooks = useMemo(
    () => readyCollections.flatMap((collection) => collection.books.filter((book) => book.run_state.status === "ready")),
    [readyCollections],
  );
  const workspaceRunState = selectedWorkspace?.run_state ?? null;
  const comparisonQuery = useWorkspaceComparison(
    selectedWorkspaceId,
    overlayTickers,
    primaryOverlayTicker,
    workspacePhase === "run" && workspaceRunState?.status === "ready",
  );
  const comparison = comparisonQuery.data ?? null;
  const comparisonPoints = comparison?.points ?? [];
  const activeBooks = workspacePhase === "run" ? runnableBooks : books;
  const playback = useWorkspacePlayback({
    comparisonDates: comparisonPoints.map((point) => point.date),
    fallbackSelectedDate: selectedWorkspace?.run_state.opening_session ?? selectedWorkspace?.start_date ?? null,
    selectedBookId,
    workspacePhase,
  });
  const clampedDateIndex = playback.clampedDateIndex;
  const selectedDate =
    comparisonPoints[clampedDateIndex]?.date ??
    selectedWorkspace?.run_state.opening_session ??
    selectedWorkspace?.start_date ??
    null;
  const selectedBook = useMemo(
    () => activeBooks.find((book) => book.id === selectedBookId) ?? books.find((book) => book.id === selectedBookId) ?? null,
    [activeBooks, books, selectedBookId],
  );
  const snapshotQuery = useBookSnapshot(selectedBookId, playback.requestedSnapshotDate, primaryOverlayTicker);
  const agentConfigured = Boolean(bootstrapQuery.data?.capabilities.agent);
  const readyCollectionCount = readyCollections.length;
  const blockedCollectionCount = collections.filter((collection) => collection.run_state.status === "blocked").length;

  const bookConfigQuery = useQuery({
    queryKey: ["book-config", editingBookId],
    queryFn: ({ signal }) => api.getBookConfig(editingBookId!, signal),
    enabled: showBookModal && bookModalMode === "edit" && Boolean(editingBookId),
    staleTime: 5 * 60 * 1000,
  });

  const simulationsQuery = useQuery({
    queryKey: ["simulations", selectedWorkspaceId],
    queryFn: ({ signal }) => api.listSimulations(selectedWorkspaceId!, signal),
    enabled: Boolean(selectedWorkspaceId),
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((s) => s.status === "pending" || s.status === "running")) return 3000;
      return false;
    },
  });
  const simulations = simulationsQuery.data ?? [];

  const simulationResultsQuery = useQuery({
    queryKey: ["simulation-results", selectedSimulationId],
    queryFn: ({ signal }) => api.getSimulationResults(selectedSimulationId!, signal),
    enabled: Boolean(selectedSimulationId) && workspacePhase === "simulation-results",
    staleTime: 30 * 1000,
  });

  const simAgentDetailQuery = useQuery({
    queryKey: ["simulation-agent", selectedSimulationId, selectedSimAgentId],
    queryFn: ({ signal }) => api.getSimulationAgent(selectedSimulationId!, selectedSimAgentId!, signal),
    enabled: Boolean(selectedSimulationId) && Boolean(selectedSimAgentId),
    staleTime: 60 * 1000,
  });

  function invalidateWorkspaceQueries(workspaceId: string | null) {
    if (!workspaceId) {
      return Promise.resolve();
    }
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-view", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-comparison", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["book-snapshot"] }),
    ]);
  }

  function openSimulationResults(simulationId: string) {
    const sim = simulations.find((s) => s.id === simulationId);
    if (!sim || sim.status !== "completed") return;
    setSelectedSimulationId(simulationId);
    setSelectedSimAgentId(null);
    setWorkspacePhase("simulation-results");
  }

  function returnFromSimulationResults() {
    setWorkspacePhase("books");
    setSelectedSimulationId(null);
    setSelectedSimAgentId(null);
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
    setActiveCollectionId(null);
    setWorkspacePhase("books");
    playback.resetPlayback();
    setScreen("workspace");
  }

  function openCreateBookModal(collectionId: string) {
    setBookError(null);
    setBookModalMode("create");
    setEditingBookId(null);
    setActiveCollectionId(collectionId);
    setShowBookModal(true);
  }

  function openEditBookModal(bookId: string) {
    setBookError(null);
    setBookModalMode("edit");
    setEditingBookId(bookId);
    setActiveCollectionId(null);
    setShowBookModal(true);
  }

  function closeBookModal() {
    setShowBookModal(false);
    setBookError(null);
    setBookModalMode("create");
    setEditingBookId(null);
    setActiveCollectionId(null);
  }

  function enterRunPhase() {
    if (workspaceRunState?.status !== "ready") {
      return;
    }
    setWorkspacePhase("run");
    playback.resetPlayback();
  }

  function returnToBooksPhase() {
    setWorkspacePhase("books");
    setSelectedSimulationId(null);
    setSelectedSimAgentId(null);
    playback.resetPlayback();
  }

  function selectBook(bookId: string) {
    setSelectedBookId(bookId);
    if (playback.isPlaying) {
      playback.togglePlayback();
    }
  }

  function deleteSelectedWorkspace() {
    if (!selectedWorkspaceId) {
      return;
    }
    requestWorkspaceDeletion(selectedWorkspaceId);
  }

  function requestWorkspaceDeletion(workspaceId: string) {
    if (!window.confirm("Delete this workspace, its collections, and every book inside them?")) {
      return;
    }
    deleteWorkspaceMutation.mutate(workspaceId);
  }

  function deleteCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) {
      return;
    }
    if (!window.confirm(`Delete ${collection.name} and all of its books?`)) {
      return;
    }
    deleteCollectionMutation.mutate(collectionId);
  }

  function deleteBook(bookId: string) {
    if (!window.confirm("Delete this book from the collection?")) {
      return;
    }
    deleteBookMutation.mutate(bookId);
  }

  function addCollection() {
    const seedCash = collections[0]?.initial_cash ?? 10000;
    createCollectionMutation.mutate({ initial_cash: seedCash });
  }

  function renameCollection(collectionId: string, currentName: string) {
    const nextName = window.prompt("Collection name", currentName)?.trim();
    if (!nextName || nextName === currentName) {
      return;
    }
    updateCollectionMutation.mutate({ collectionId, payload: { name: nextName } });
  }

  function editCollectionBankroll(collectionId: string, currentCash: number) {
    const raw = window.prompt("Collection bankroll", String(Math.round(currentCash)))?.trim();
    if (!raw) {
      return;
    }
    const parsed = Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === currentCash) {
      return;
    }
    updateCollectionMutation.mutate({ collectionId, payload: { initial_cash: parsed } });
  }

  function addOverlayTicker(ticker: string) {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setOverlayTickers((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setPrimaryOverlayTicker((current) => current ?? normalized);
  }

  function removeOverlayTicker(ticker: string) {
    setOverlayTickers((current) => {
      if (current.length <= 1) {
        return current;
      }
      const next = current.filter((item) => item !== ticker);
      setPrimaryOverlayTicker((currentPrimary) => (currentPrimary === ticker ? next[0] ?? null : currentPrimary));
      return next;
    });
  }

  function setPrimaryOverlay(ticker: string) {
    if (!overlayTickers.includes(ticker)) {
      return;
    }
    setPrimaryOverlayTicker(ticker);
  }

  useEffect(() => {
    if (workspacesQuery.isLoading) {
      return;
    }

    const workspaceList = workspacesQuery.data ?? [];
    if (!workspaceList.length) {
      if (!selectedWorkspaceId) {
        setScreen("create");
      }
      return;
    }

    if (selectedWorkspaceId && !workspaceList.some((workspaceItem) => workspaceItem.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(null);
      setSelectedBookId(null);
      setActiveCollectionId(null);
      setWorkspacePhase("books");
      playback.resetPlayback();
      setScreen("browser");
    }
  }, [playback, selectedWorkspaceId, workspacesQuery.data, workspacesQuery.isLoading]);

  useEffect(() => {
    const defaultTicker = bootstrapQuery.data?.benchmark_ticker ?? "SPY";
    if (!selectedWorkspaceId) {
      setOverlayTickers([]);
      setPrimaryOverlayTicker(null);
      return;
    }
    setOverlayTickers([defaultTicker]);
    setPrimaryOverlayTicker(defaultTicker);
  }, [bootstrapQuery.data?.benchmark_ticker, selectedWorkspaceId]);

  useEffect(() => {
    if (!activeBooks.length) {
      setSelectedBookId(null);
      if (workspacePhase === "run") {
        setWorkspacePhase("books");
      }
      return;
    }
    if (!selectedBookId || !activeBooks.some((book) => book.id === selectedBookId)) {
      setSelectedBookId(activeBooks[0].id);
    }
  }, [activeBooks, selectedBookId, workspacePhase]);

  useEffect(() => {
    if (workspacePhase === "run" && workspaceRunState?.status !== "ready") {
      setWorkspacePhase("books");
      playback.resetPlayback();
    }
  }, [playback, workspacePhase, workspaceRunState?.status]);

  const createWorkspaceMutation = useMutation({
    mutationFn: () => api.createWorkspace({ start_date: workspaceStartDate }),
    onSuccess: async (created) => {
      setWorkspaceError(null);
      setWorkspaceStartDate(defaultGuidedRunDate());
      setSelectedWorkspaceId(created.id);
      setSelectedBookId(null);
      setActiveCollectionId(null);
      setWorkspacePhase("books");
      playback.resetPlayback();
      setScreen("workspace");
      await invalidateWorkspaceQueries(created.id);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to create workspace."));
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: (payload: { initial_cash: number }) => api.createCollection(selectedWorkspaceId!, payload),
    onSuccess: async () => {
      setWorkspaceError(null);
      await invalidateWorkspaceQueries(selectedWorkspaceId);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to create collection."));
    },
  });

  const updateCollectionMutation = useMutation({
    mutationFn: ({ collectionId, payload }: { collectionId: string; payload: { name?: string; initial_cash?: number } }) =>
      api.updateCollection(collectionId, payload),
    onSuccess: async () => {
      setWorkspaceError(null);
      setWorkspacePhase("books");
      playback.resetPlayback();
      await invalidateWorkspaceQueries(selectedWorkspaceId);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to update collection."));
    },
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: (collectionId: string) => api.deleteCollection(collectionId),
    onSuccess: async (_, collectionId) => {
      setWorkspacePhase("books");
      playback.resetPlayback();
      setShowAgentDrawer(false);
      if (selectedBook && selectedBook.collection_id === collectionId) {
        setSelectedBookId(null);
      }
      await invalidateWorkspaceQueries(selectedWorkspaceId);
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to delete collection."));
    },
  });

  const createBookMutation = useMutation({
    mutationFn: (payload: BookCreateRequest) => {
      if (!activeCollectionId) {
        throw new Error("Select a collection first.");
      }
      return api.createBook(activeCollectionId, payload);
    },
    onSuccess: async (created) => {
      setBookError(null);
      closeBookModal();
      setSelectedBookId(created.id);
      setWorkspacePhase("books");
      playback.resetPlayback();
      setScreen("workspace");
      await invalidateWorkspaceQueries(selectedWorkspaceId);
    },
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
    onSuccess: async (updated) => {
      setBookError(null);
      closeBookModal();
      setSelectedBookId(updated.id);
      setWorkspacePhase("books");
      playback.resetPlayback();
      setScreen("workspace");
      await Promise.all([
        invalidateWorkspaceQueries(selectedWorkspaceId),
        queryClient.invalidateQueries({ queryKey: ["book-config", updated.id] }),
        queryClient.removeQueries({ queryKey: ["book-snapshot", updated.id] }),
      ]);
    },
    onError: (error) => {
      setBookError(errorMessage(error, "Unable to update book."));
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: (workspaceId: string) => api.deleteWorkspace(workspaceId),
    onSuccess: async (_, deletedWorkspaceId) => {
      const deletedSelectedWorkspace = selectedWorkspaceId === deletedWorkspaceId;
      setWorkspaceError(null);

      queryClient.setQueryData<WorkspaceSummary[]>(["workspaces"], (current) =>
        (current ?? []).filter((workspace) => workspace.id !== deletedWorkspaceId),
      );

      if (deletedSelectedWorkspace) {
        setSelectedWorkspaceId(null);
        setSelectedBookId(null);
        setActiveCollectionId(null);
        setWorkspacePhase("books");
        playback.resetPlayback();
        setShowAgentDrawer(false);
        setScreen("browser");
        queryClient.removeQueries({ queryKey: ["book-snapshot"] });
      }

      queryClient.removeQueries({ queryKey: ["workspace-view", deletedWorkspaceId] });
      queryClient.removeQueries({ queryKey: ["workspace-comparison", deletedWorkspaceId] });
      await queryClient.refetchQueries({ queryKey: ["workspaces"], type: "active" });
    },
    onError: (error) => {
      setWorkspaceError(errorMessage(error, "Unable to delete workspace."));
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: (bookId: string) => api.deleteBook(bookId),
    onSuccess: async (_, deletedBookId) => {
      setWorkspacePhase("books");
      playback.resetPlayback();
      setShowAgentDrawer(false);
      if (selectedBookId === deletedBookId) {
        setSelectedBookId(null);
      }
      queryClient.removeQueries({ queryKey: ["book-snapshot", deletedBookId] });
      await invalidateWorkspaceQueries(selectedWorkspaceId);
    },
  });

  const createSimulationMutation = useMutation({
    mutationFn: (payload: SimulationCreateRequest) => api.createSimulation(selectedWorkspaceId!, payload),
    onSuccess: async () => {
      setSimulationError(null);
      setShowSimulationModal(false);
      await queryClient.invalidateQueries({ queryKey: ["simulations", selectedWorkspaceId] });
    },
    onError: (error) => {
      setSimulationError(errorMessage(error, "Unable to create simulation."));
    },
  });

  const deleteSimulationMutation = useMutation({
    mutationFn: (simulationId: string) => api.deleteSimulation(simulationId),
    onSuccess: async (_, deletedId) => {
      if (selectedSimulationId === deletedId) {
        returnFromSimulationResults();
      }
      await queryClient.invalidateQueries({ queryKey: ["simulations", selectedWorkspaceId] });
    },
  });

  const loadingState =
    bootstrapQuery.isLoading ||
    settingsQuery.isLoading ||
    workspacesQuery.isLoading ||
    (selectedWorkspaceId ? workspaceViewQuery.isLoading : false) ||
    (workspacePhase === "run" && selectedWorkspaceId ? comparisonQuery.isLoading : false);

  const createCollectionPending = createCollectionMutation.isPending;
  const deletingWorkspaceId = deleteWorkspaceMutation.isPending ? (deleteWorkspaceMutation.variables ?? null) : null;
  const collectionActionPendingId =
    deleteCollectionMutation.isPending
      ? (deleteCollectionMutation.variables ?? null)
      : updateCollectionMutation.isPending
        ? (updateCollectionMutation.variables?.collectionId ?? null)
        : null;
  const bookModalCollectionName =
    bookModalMode === "create"
      ? collections.find((collection) => collection.id === activeCollectionId)?.name ?? null
      : bookConfigQuery.data?.collection_name ?? null;

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
            <div className="mx-auto grid w-full max-w-[1440px] content-start gap-6">
              <WorkspaceTopBar
                centerLabel="Workspace Browser"
                onOpenSettings={() => setShowSettingsModal(true)}
                settingsDisabled={settingsQuery.isLoading || settingsQuery.isError}
              />
              <div className="mx-auto grid w-full max-w-[1120px] gap-6">
                {workspaceError ? (
                  <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="px-6 py-4 text-sm text-destructive">{workspaceError}</CardContent>
                  </Card>
                ) : null}
                <WorkspaceBrowser
                  deletingWorkspaceId={deletingWorkspaceId}
                  loading={workspacesQuery.isLoading}
                  onCreateWorkspace={openWorkspaceCreate}
                  onDeleteWorkspace={requestWorkspaceDeletion}
                  onPickWorkspace={selectWorkspace}
                  onReturnToWorkspace={selectedWorkspaceId ? () => setScreen("workspace") : undefined}
                  selectedWorkspaceId={selectedWorkspaceId}
                  workspaces={workspacesQuery.data ?? []}
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-[1440px] content-start gap-6">
              {selectedWorkspace ? (
                <>
                  <WorkspaceTopBar
                    agentConfigured={agentConfigured}
                    onBackToBrowser={openWorkspaceBrowser}
                    onDeleteWorkspace={deleteSelectedWorkspace}
                    onOpenAnalysis={() => setShowAgentDrawer(true)}
                    onOpenSettings={() => setShowSettingsModal(true)}
                    onReturnToBooks={returnToBooksPhase}
                    phase={workspacePhase}
                    settingsDisabled={settingsQuery.isLoading || settingsQuery.isError}
                    workspaceName={selectedWorkspace.name}
                    startDate={selectedWorkspace.start_date}
                  />
                </>
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
              ) : workspaceViewQuery.isError || (workspacePhase === "run" && comparisonQuery.isError) ? (
                <Card className="surface-panel border-border/80">
                  <CardContent className="grid min-h-[320px] place-items-center px-6 py-8 text-center">
                    <div className="max-w-lg">
                      <p className="text-lg font-semibold">Unable to load this workspace.</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {workspacePhase === "run" && comparisonQuery.isError
                          ? errorMessage(comparisonQuery.error, "The comparison data could not be loaded.")
                          : "Refresh the page or create a new workspace to continue."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : workspacePhase === "books" ? (
                <>
                  <WorkspaceBooksPhase
                    collectionActionPendingId={collectionActionPendingId}
                    collections={collections}
                    createCollectionPending={createCollectionPending}
                    deletePendingBookId={deleteBookMutation.isPending ? (deleteBookMutation.variables ?? null) : null}
                    onAddBook={openCreateBookModal}
                    onAddCollection={addCollection}
                    onDeleteBook={deleteBook}
                    onDeleteCollection={deleteCollection}
                    onEditBook={openEditBookModal}
                    onEditCollectionBankroll={editCollectionBankroll}
                    onEnterRunPhase={enterRunPhase}
                    onRenameCollection={renameCollection}
                    onSelectBook={selectBook}
                    readyCollectionCount={readyCollectionCount}
                    runDisabled={workspaceRunState?.status !== "ready"}
                    selectedBookId={selectedBookId}
                    workspaceIssue={workspaceRunState?.issues[0]?.message ?? null}
                    workspaceStatus={workspaceRunState?.status ?? "draft"}
                  />

                  <SimulationsPanel
                    deletePendingId={deleteSimulationMutation.isPending ? (deleteSimulationMutation.variables ?? null) : null}
                    onCreateSimulation={() => {
                      setSimulationError(null);
                      setShowSimulationModal(true);
                    }}
                    onDeleteSimulation={(id) => {
                      if (!window.confirm("Delete this simulation and all its results?")) return;
                      deleteSimulationMutation.mutate(id);
                    }}
                    onSelectSimulation={openSimulationResults}
                    selectedSimulationId={selectedSimulationId}
                    simulations={simulations}
                  />
                </>
              ) : workspacePhase === "simulation-results" && simulationResultsQuery.data ? (
                <Suspense fallback={null}>
                  <SimulationResultsView
                    agentDetail={simAgentDetailQuery.data ?? null}
                    agentDetailLoading={simAgentDetailQuery.isLoading}
                    onBack={returnFromSimulationResults}
                    onSelectAgent={setSelectedSimAgentId}
                    results={simulationResultsQuery.data}
                  />
                </Suspense>
              ) : (
                <>
                  <Suspense fallback={null}>
                    <WorkspaceComparisonChart
                      books={runnableBooks}
                      comparison={comparison}
                      isPlaying={playback.isPlaying}
                      onAddOverlayTicker={addOverlayTicker}
                      onPlaybackRateChange={playback.setPlaybackRate}
                      onPlayPause={playback.togglePlayback}
                      onRemoveOverlayTicker={removeOverlayTicker}
                      onReset={playback.resetPlayback}
                      onSelectBook={selectBook}
                      onSelectDateIndex={playback.selectDateIndex}
                      onSetPrimaryOverlay={setPrimaryOverlay}
                      overlayTickers={overlayTickers}
                      playbackRate={playback.playbackRate}
                      primaryBenchmarkTicker={primaryOverlayTicker}
                      selectedBookId={selectedBookId}
                      selectedDateIndex={clampedDateIndex}
                    />
                  </Suspense>

                  <Suspense fallback={null}>
                    <BookSnapshotPanel
                      book={selectedBook}
                      error={snapshotQuery.error}
                      loading={snapshotQuery.isLoading || snapshotQuery.isFetching}
                      snapshot={snapshotQuery.data}
                    />
                  </Suspense>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <CreateBookModal
          collectionName={bookModalCollectionName}
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
          workspaceId={selectedWorkspaceId}
        />
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        <CreateSimulationModal
          error={simulationError}
          onClose={() => {
            setShowSimulationModal(false);
            setSimulationError(null);
          }}
          onSubmit={(payload) => createSimulationMutation.mutate(payload)}
          open={showSimulationModal}
          pending={createSimulationMutation.isPending}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SettingsModal onClose={() => setShowSettingsModal(false)} open={showSettingsModal} settings={settingsQuery.data} />
      </Suspense>
    </>
  );
}
