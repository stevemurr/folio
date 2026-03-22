import { WorkspaceDetail } from "../api/client";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Props = {
  blockedCollectionCount: number;
  readyCollectionCount: number;
  workspace: WorkspaceDetail;
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

export default function WorkspaceHero({
  blockedCollectionCount,
  readyCollectionCount,
  workspace,
}: Props) {
  const openingSession = workspace.run_state.opening_session ?? workspace.start_date;
  const openingShifted = openingSession !== workspace.start_date;

  return (
    <Card className="surface-panel border-border/80 shadow-panel">
      <CardHeader className="gap-3 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Workspace</Badge>
              <Badge variant="outline">
                {workspace.collection_count} {workspace.collection_count === 1 ? "collection" : "collections"}
              </Badge>
              <Badge variant="outline">
                {workspace.book_count} {workspace.book_count === 1 ? "book" : "books"}
              </Badge>
            </div>
            <CardTitle className="text-3xl leading-[0.95] sm:text-4xl">{workspace.name}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-3 pt-4">
        {readyCollectionCount ? (
          <div className="inline-flex min-h-[2.75rem] items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
            {readyCollectionCount} ready
          </div>
        ) : null}

        {blockedCollectionCount ? (
          <div className="inline-flex min-h-[2.75rem] items-center rounded-full border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {blockedCollectionCount} blocked
          </div>
        ) : null}

        {!workspace.book_count ? (
          <div className="inline-flex min-h-[2.75rem] items-center rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground">
            No books yet
          </div>
        ) : null}

        {openingShifted ? (
          <div className="inline-flex min-h-[2.75rem] items-center rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground">
            Market opens {formatLongDate(openingSession)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
