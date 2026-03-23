import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import type { GeneratorKind, SimulationCreateRequest } from "../api/client";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import ModalShell from "./ui/modal-shell";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: SimulationCreateRequest) => void;
  pending?: boolean;
  error?: string | null;
};

const GENERATOR_OPTIONS: { value: GeneratorKind; label: string; description: string }[] = [
  { value: "random_weight", label: "Random Weight", description: "Dirichlet-sampled weights across a ticker universe" },
  { value: "sweep", label: "Sweep", description: "Linear sweep between two assets from 100/0 to 0/100" },
  { value: "subset", label: "Random Subset", description: "Random subsets of K tickers from a larger universe" },
  { value: "equal_weight", label: "Equal Weight", description: "Equal allocation across all tickers" },
  { value: "fixed", label: "Fixed", description: "All agents use the same allocation" },
];

export default function CreateSimulationModal({ open, onClose, onSubmit, pending = false, error }: Props) {
  const [name, setName] = useState("");
  const [agentCount, setAgentCount] = useState(50);
  const [generatorKind, setGeneratorKind] = useState<GeneratorKind>("random_weight");
  const [universe, setUniverse] = useState("SPY, QQQ, AAPL, MSFT, GOOGL");
  const [tickerA, setTickerA] = useState("SPY");
  const [tickerB, setTickerB] = useState("AGG");
  const [pickCount, setPickCount] = useState(3);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    let generatorParams: Record<string, unknown> = {};
    const tickers = universe
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    switch (generatorKind) {
      case "random_weight":
      case "equal_weight":
        generatorParams = { universe: tickers };
        break;
      case "sweep":
        generatorParams = { ticker_a: tickerA.trim().toUpperCase(), ticker_b: tickerB.trim().toUpperCase() };
        break;
      case "subset":
        generatorParams = { universe: tickers, pick_count: pickCount };
        break;
      case "fixed":
        generatorParams = {
          allocations: tickers.map((t) => ({ ticker: t, asset_type: "stock", weight: 100 / tickers.length })),
        };
        break;
    }

    onSubmit({
      name: name.trim() || `${generatorKind} × ${agentCount}`,
      agent_count: agentCount,
      generator_kind: generatorKind,
      generator_params: generatorParams,
    });
  }

  function resetForm() {
    setName("");
    setAgentCount(50);
    setGeneratorKind("random_weight");
    setUniverse("SPY, QQQ, AAPL, MSFT, GOOGL");
    setTickerA("SPY");
    setTickerB("AGG");
    setPickCount(3);
  }

  return (
    <ModalShell contentClassName="max-w-lg" open={open}>
      <Card className="surface-panel border-border/80">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-5">
          <strong className="text-xl">New Simulation</strong>
          <Button
            onClick={() => {
              resetForm();
              onClose();
            }}
            size="icon"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-6">
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-name">
                Name
              </label>
              <Input
                id="sim-name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tech universe sweep"
                value={name}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-agents">
                Agent Count
              </label>
              <div className="flex items-center gap-3">
                <input
                  className="flex-1"
                  id="sim-agents"
                  max={1000}
                  min={1}
                  onChange={(e) => setAgentCount(Number(e.target.value))}
                  type="range"
                  value={agentCount}
                />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{agentCount}</span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Generator</label>
              <div className="grid gap-2">
                {GENERATOR_OPTIONS.map((opt) => (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      generatorKind === opt.value ? "border-primary/40 bg-primary/5" : "border-border/70 hover:bg-card/80"
                    }`}
                    key={opt.value}
                  >
                    <input
                      checked={generatorKind === opt.value}
                      className="mt-0.5"
                      name="generator"
                      onChange={() => setGeneratorKind(opt.value)}
                      type="radio"
                      value={opt.value}
                    />
                    <div>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {(generatorKind === "random_weight" ||
              generatorKind === "equal_weight" ||
              generatorKind === "subset" ||
              generatorKind === "fixed") && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-universe">
                  Ticker Universe (comma-separated)
                </label>
                <Input
                  id="sim-universe"
                  onChange={(e) => setUniverse(e.target.value)}
                  placeholder="SPY, QQQ, AAPL, MSFT"
                  value={universe}
                />
              </div>
            )}

            {generatorKind === "subset" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-pick">
                  Pick count (per agent)
                </label>
                <Input
                  id="sim-pick"
                  min={1}
                  onChange={(e) => setPickCount(Number(e.target.value))}
                  type="number"
                  value={pickCount}
                />
              </div>
            )}

            {generatorKind === "sweep" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-ta">
                    Ticker A
                  </label>
                  <Input id="sim-ta" onChange={(e) => setTickerA(e.target.value)} value={tickerA} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="sim-tb">
                    Ticker B
                  </label>
                  <Input id="sim-tb" onChange={(e) => setTickerB(e.target.value)} value={tickerB} />
                </div>
              </div>
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Creating..." : "Launch Simulation"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </ModalShell>
  );
}
