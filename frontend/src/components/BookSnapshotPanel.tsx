import { ApiClientError, BookSnapshot, BookSummary } from "../api/client";
import MetricsStrip from "./MetricsStrip";
import PositionsTable from "./PositionsTable";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type Props = {
  book: BookSummary | null;
  error: unknown;
  loading: boolean;
  snapshot: BookSnapshot | undefined;
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

function snapshotErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.detail.message;
  }
  return "Unable to load this book snapshot.";
}

export default function BookSnapshotPanel({ book, error, loading, snapshot }: Props) {
  if (!book) {
    return (
      <Card className="surface-panel border-border/80">
        <CardContent className="grid min-h-[280px] place-items-center px-6 py-8 text-center">
          <div className="max-w-lg">
            <p className="text-lg font-semibold">Select a book to inspect it.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The detail panel updates for the current date slice.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="grid gap-4">
      <Card className="surface-panel border-border/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Book Detail</Badge>
              <Badge variant="outline">{snapshot ? formatLongDate(snapshot.as_of) : "Loading..."}</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle>{book.name}</CardTitle>
              <CardDescription className="max-w-3xl leading-6">{book.description || "No description provided."}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading && !snapshot ? (
            <div className="surface-panel-muted grid min-h-[200px] place-items-center rounded-[18px] border border-dashed border-border/70 px-6 text-center text-sm text-muted-foreground">
              <p>Loading the selected date slice...</p>
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {snapshotErrorMessage(error)}
            </div>
          ) : snapshot ? (
            <div className="grid gap-4">
              <MetricsStrip metrics={snapshot.metrics} />
              <PositionsTable allocation={snapshot.allocation} positions={snapshot.positions} />
            </div>
          ) : (
            <div className="surface-panel-muted grid min-h-[200px] place-items-center rounded-[18px] border border-dashed border-border/70 px-6 text-center text-sm text-muted-foreground">
              <p>No snapshot is available for this book.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
