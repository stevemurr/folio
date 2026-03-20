import { FormEvent } from "react";
import { FolderPlus, X } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export type CreatePortfolioState = {
  name: string;
  description: string;
  initialCash: string;
};

export const initialCreatePortfolioState: CreatePortfolioState = {
  name: "",
  description: "",
  initialCash: "10000",
};

type Props = {
  error: string | null;
  open: boolean;
  pending: boolean;
  state: CreatePortfolioState;
  onChange: (next: CreatePortfolioState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function CreatePortfolioModal({
  error,
  open,
  pending,
  state,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-40 grid place-items-center bg-[rgba(29,23,19,0.5)] p-4 backdrop-blur-sm"
      role="dialog"
    >
      <Card className="w-full max-w-xl border-border/80 bg-card/95">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              New Portfolio
            </div>
            <CardTitle className="text-3xl">Open A New Desk</CardTitle>
            <CardDescription className="leading-6">
              Start with strict cash, pick a thesis, and begin the historical replay.
            </CardDescription>
          </div>
          <Button aria-label="Close create portfolio" onClick={onClose} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              <span>Name</span>
              <Input
                autoFocus
                onChange={(event) => onChange({ ...state, name: event.target.value })}
                placeholder="Core Portfolio"
                value={state.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              <span>Description</span>
              <Textarea
                className="min-h-[112px]"
                onChange={(event) => onChange({ ...state, description: event.target.value })}
                placeholder="Focus on growth with broad-market ballast."
                rows={4}
                value={state.description}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              <span>Initial Cash</span>
              <Input
                inputMode="decimal"
                onChange={(event) => onChange({ ...state, initialCash: event.target.value })}
                value={state.initialCash}
              />
            </label>
            {error ? (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button onClick={onClose} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                <FolderPlus className="h-4 w-4" />
                {pending ? "Creating..." : "Create Portfolio"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
