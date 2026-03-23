import { ArrowLeft, Bot, Settings2, Trash2 } from "lucide-react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type WorkspacePhase = "books" | "run" | "simulation-results";

type Props = {
  agentConfigured?: boolean;
  centerLabel?: string;
  onBackToBrowser?: () => void;
  onDeleteWorkspace?: () => void;
  onOpenAnalysis?: () => void;
  onOpenSettings?: () => void;
  onReturnToBooks?: () => void;
  phase?: WorkspacePhase;
  settingsDisabled?: boolean;
  workspaceName?: string;
  startDate?: string | null;
};

function formatShortDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default function WorkspaceTopBar({
  agentConfigured,
  centerLabel,
  onBackToBrowser,
  onDeleteWorkspace,
  onOpenAnalysis,
  onOpenSettings,
  onReturnToBooks,
  phase,
  settingsDisabled,
  startDate,
}: Props) {
  const inRunMode = phase === "run";
  const center = centerLabel ?? (startDate ? formatShortDate(startDate) : null);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[18px] border border-border/70 bg-background/45 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {onBackToBrowser ? (
          <Button onClick={onBackToBrowser} size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Back to Browser
          </Button>
        ) : <span />}
      </div>

      {center ? (
        <Badge variant="outline">{center}</Badge>
      ) : <span />}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {inRunMode && onReturnToBooks ? (
          <Button onClick={onReturnToBooks} size="sm" variant="secondary">
            Back to Setup
          </Button>
        ) : null}
        {onOpenAnalysis ? (
          <Button onClick={onOpenAnalysis} size="sm" variant="ghost">
            <Bot className="h-4 w-4" />
            {agentConfigured ? "Analysis" : "Analysis Setup"}
          </Button>
        ) : null}
        {onOpenSettings ? (
          <Button aria-label="Open settings" disabled={settingsDisabled} onClick={onOpenSettings} size="icon" variant="ghost">
            <Settings2 className="h-4 w-4" />
          </Button>
        ) : null}
        {onDeleteWorkspace ? (
          <Button aria-label="Delete workspace" onClick={onDeleteWorkspace} size="icon" variant="ghost">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
