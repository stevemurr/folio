import type { CSSProperties } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { BookSummary } from "../api/client";
import { bookAccent } from "../lib/bookAppearance";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type Props = {
  books: BookSummary[];
  deletePendingBookId: string | null;
  onAddBook: () => void;
  onDeleteBook: (bookId: string) => void;
  onEditBook: (bookId: string) => void;
  onSelectBook: (bookId: string) => void;
  selectedBookId: string | null;
  startDate: string;
};

function formatLongDate(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default function WorkspaceBooksPhase({
  books,
  deletePendingBookId,
  onAddBook,
  onDeleteBook,
  onEditBook,
  onSelectBook,
  selectedBookId,
  startDate,
}: Props) {
  return (
    <Card className="surface-panel border-border/80">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Books</Badge>
            <Badge variant="outline">{books.length} loaded</Badge>
          </div>
          <div className="space-y-2">
            <CardTitle>Build the books for this age.</CardTitle>
            <CardDescription className="max-w-3xl leading-6">
              Add and tune strategies for {formatLongDate(startDate)}. Each tile is one buy-and-hold book in the shared run.
            </CardDescription>
          </div>
        </div>

        <Button onClick={onAddBook}>Add Book</Button>
      </CardHeader>

      <CardContent className="pt-6">
        {!books.length ? (
          <div className="surface-panel-muted grid min-h-[280px] place-items-center rounded-[20px] border border-dashed border-border/70 px-6 text-center">
            <div className="max-w-lg">
              <p className="text-lg font-semibold">No books loaded yet.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add the first strategy for {formatLongDate(startDate)} from the books header above.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {books.map((book) => {
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
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: accent.color }}
                  />
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
                      </div>
                      <div>
                        <strong className="block text-xl text-foreground">{book.name}</strong>
                        <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                          {book.description || "No description provided."}
                        </span>
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

                  <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="surface-panel-soft rounded-[16px] border border-border/70 px-4 py-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Holdings
                      </span>
                      <span className="mt-2 block text-sm text-foreground">
                        {book.total_positions} {book.total_positions === 1 ? "position" : "positions"}
                      </span>
                    </div>
                    <div className="surface-panel-soft rounded-[16px] border border-border/70 px-4 py-3">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Cash Reserve
                      </span>
                      <span className="mt-2 block text-sm text-foreground">{book.cash_weight.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
