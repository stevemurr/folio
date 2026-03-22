import { ArrowLeft, Bot, Settings2, Trash2 } from "lucide-react";

import { Button } from "./ui/button";

type WorkspacePhase = "books" | "run";

type Props = {
  agentConfigured: boolean;
  onBackToBrowser: () => void;
  onDeleteWorkspace: () => void;
  onOpenAnalysis: () => void;
  onOpenSettings: () => void;
  onReturnToBooks: () => void;
  phase: WorkspacePhase;
  settingsDisabled?: boolean;
};

export default function WorkspaceTopBar({
  agentConfigured,
  onBackToBrowser,
  onDeleteWorkspace,
  onOpenAnalysis,
  onOpenSettings,
  onReturnToBooks,
  phase,
  settingsDisabled,
}: Props) {
  const inRunMode = phase === "run";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border/70 bg-background/45 px-4 py-3 backdrop-blur-sm">
      <Button onClick={onBackToBrowser} size="sm" variant="ghost">
        <ArrowLeft className="h-4 w-4" />
        Back to Browser
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        {inRunMode ? (
          <Button onClick={onReturnToBooks} size="sm" variant="secondary">
            Back to Setup
          </Button>
        ) : null}
        <Button onClick={onOpenAnalysis} size="sm" variant="ghost">
          <Bot className="h-4 w-4" />
          {agentConfigured ? "Analysis" : "Analysis Setup"}
        </Button>
        <Button aria-label="Open settings" disabled={settingsDisabled} onClick={onOpenSettings} size="icon" variant="ghost">
          <Settings2 className="h-4 w-4" />
        </Button>
        <Button aria-label="Delete workspace" onClick={onDeleteWorkspace} size="icon" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
