import type { CSSProperties } from "react";
import { Pencil, Play, Plus, Trash2, Wallet } from "lucide-react";

import { BookSummary, CollectionDetail } from "../api/client";
import { bookAccent } from "../lib/bookAppearance";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";

type Props = {
  collectionActionPendingId: string | null;
  collections: CollectionDetail[];
  createCollectionPending?: boolean;
  deletePendingBookId: string | null;
  onAddBook: (collectionId: string) => void;
  onAddCollection: () => void;
  onDeleteBook: (bookId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onEditBook: (bookId: string) => void;
  onEditCollectionBankroll: (collectionId: string, currentCash: number) => void;
  onEnterRunPhase: () => void;
  onRenameCollection: (collectionId: string, currentName: string) => void;
  onSelectBook: (bookId: string) => void;
  readyCollectionCount: number;
  runDisabled?: boolean;
  selectedBookId: string | null;
  workspaceIssue?: string | null;
  workspaceStatus: "draft" | "ready" | "blocked";
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function bookCard(
  book: BookSummary,
  selectedBookId: string | null,
  deletePendingBookId: string | null,
  onSelectBook: (bookId: string) => void,
  onEditBook: (bookId: string) => void,
  onDeleteBook: (bookId: string) => void,
) {
  const accent = bookAccent(book.id);
  const active = book.id === selectedBookId;
  const allocationPreview = book.allocation_preview.slice(0, 4);

  return (
    <div
      aria-label={`Select ${book.name}`}
      className={cn(
        "group relative overflow-hidden rounded-[22px] border bg-card/70 px-5 py-5 text-left transition-all",
        active ? "shadow-[0_0_0_1px_var(--book-ring)]" : "hover:-translate-y-0.5 hover:bg-card/88",
      )}
      key={book.id}
      onClick={() => onSelectBook(book.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectBook(book.id);
        }
      }}
      role="button"
      style={
        {
          borderColor: active ? accent.ring : "hsl(var(--border))",
          boxShadow: active ? `0 0 0 1px ${accent.ring}` : undefined,
          "--book-ring": accent.ring,
          "--book-wash": accent.wash,
        } as CSSProperties
      }
      tabIndex={0}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent.color }} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 top-10 h-28 w-28 rounded-full blur-3xl"
        style={{ backgroundColor: accent.wash }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{book.strategy_kind === "preset" ? "Preset" : "Custom"}</Badge>
            {book.preset_id ? <Badge variant="outline">{book.preset_id.toUpperCase()}</Badge> : null}
            <Badge variant={book.run_state.status === "blocked" ? "secondary" : "outline"}>
              {book.run_state.status === "blocked" ? "Blocked" : "Ready"}
            </Badge>
          </div>
          <div>
            <strong className="block text-xl text-foreground">{book.name}</strong>
            <span className="mt-2 block text-sm leading-6 text-muted-foreground">
              {book.description || "No description provided."}
            </span>
            {book.run_state.status === "blocked" ? (
              <span className="mt-2 block text-sm leading-6 text-destructive">
                {book.run_state.issues[0]?.message ?? "This book cannot launch on the shared opening session."}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            aria-label={`Edit ${book.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onEditBook(book.id);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            aria-label={`Delete ${book.name}`}
            disabled={deletePendingBookId === book.id}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteBook(book.id);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-2">
        {allocationPreview.map((allocation) => (
          <span
            className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
            key={`${book.id}-${allocation.ticker}`}
          >
            {allocation.ticker} {allocation.weight.toFixed(0)}%
          </span>
        ))}
        {book.cash_weight > 0 ? (
          <span className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cash {book.cash_weight.toFixed(0)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function WorkspaceBooksPhase({
  collectionActionPendingId,
  collections,
  createCollectionPending = false,
  deletePendingBookId,
  onAddBook,
  onAddCollection,
  onDeleteBook,
  onDeleteCollection,
  onEditBook,
  onEditCollectionBankroll,
  onEnterRunPhase,
  onRenameCollection,
  onSelectBook,
  readyCollectionCount,
  runDisabled = false,
  selectedBookId,
  workspaceIssue,
  workspaceStatus,
}: Props) {
  return (
    <Card className="surface-panel border-border/80">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Collections</Badge>
          <Badge variant="outline">
            {collections.length} {collections.length === 1 ? "cohort" : "cohorts"}
          </Badge>
          {readyCollectionCount ? <Badge variant="outline">{readyCollectionCount} ready</Badge> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={runDisabled} onClick={onEnterRunPhase}>
            <Play className="h-4 w-4 fill-current" />
            Run
          </Button>
          <Button disabled={createCollectionPending} onClick={onAddCollection} variant="secondary">
            <Plus className="h-4 w-4" />
            Add Collection
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 pt-6">
        {workspaceStatus === "blocked" ? (
          <div className="rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {workspaceIssue ?? "No runnable collection is available for replay yet."}
          </div>
        ) : null}

        {!collections.length ? (
          <div className="surface-panel-muted grid min-h-[280px] place-items-center rounded-[20px] border border-dashed border-border/70 px-6 text-center">
            <div className="max-w-lg">
              <p className="text-lg font-semibold">No collections loaded yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add a bankroll cohort, then start building books inside it.
              </p>
            </div>
          </div>
        ) : (
          collections.map((collection) => {
            const collectionPending = collectionActionPendingId === collection.id;
            return (
              <section
                className="rounded-[24px] border border-border/70 bg-card/50 p-5"
                key={collection.id}
              >
                <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatCurrency(collection.initial_cash)}</Badge>
                      <Badge variant={collection.run_state.status === "blocked" ? "secondary" : "outline"}>
                        {collection.run_state.status}
                      </Badge>
                      <Badge variant="outline">
                        {collection.book_count} {collection.book_count === 1 ? "book" : "books"}
                      </Badge>
                    </div>
                    <div>
                      <strong className="block text-2xl text-foreground">{collection.name}</strong>
                      {collection.run_state.status === "draft" ? (
                        <span className="mt-2 block text-sm leading-6 text-muted-foreground">No books yet.</span>
                      ) : null}
                      {collection.run_state.status === "blocked" ? (
                        <span className="mt-2 block text-sm leading-6 text-destructive">
                          {collection.run_state.issues[0]?.message ?? "This collection is blocked until its books are fixed."}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={collectionPending} onClick={() => onAddBook(collection.id)} size="sm">
                      <Plus className="h-4 w-4" />
                      Add Book
                    </Button>
                    <Button
                      disabled={collectionPending}
                      onClick={() => onEditCollectionBankroll(collection.id, collection.initial_cash)}
                      size="sm"
                      variant="ghost"
                    >
                      <Wallet className="h-4 w-4" />
                      Bankroll
                    </Button>
                    <Button
                      disabled={collectionPending}
                      onClick={() => onRenameCollection(collection.id, collection.name)}
                      size="sm"
                      variant="ghost"
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </Button>
                    <Button
                      aria-label={`Delete ${collection.name}`}
                      disabled={collectionPending}
                      onClick={() => onDeleteCollection(collection.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {collection.books.length ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {collection.books.map((book) =>
                      bookCard(
                        book,
                        selectedBookId,
                        deletePendingBookId,
                        onSelectBook,
                        onEditBook,
                        onDeleteBook,
                      ),
                    )}
                  </div>
                ) : (
                  <div className="surface-panel-muted mt-5 grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-border/70 px-6 text-center">
                    <div className="max-w-md">
                      <p className="text-base font-semibold">No books in {collection.name} yet.</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Add the first strategy to seed this bankroll cohort.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
