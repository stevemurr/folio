import { useEffect, useRef } from "react";
import { Bot, X } from "lucide-react";

import { BootstrapConfig } from "../api/client";
import { cn } from "../lib/utils";
import { useAgentChat } from "../hooks/useAgentChat";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  bootstrap: BootstrapConfig;
  open: boolean;
  onClose: () => void;
  portfolioId: string | null;
};

export default function AgentSidebar({ bootstrap, open, onClose, portfolioId }: Props) {
  const agent = useAgentChat(bootstrap, portfolioId);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!historyRef.current) {
      return;
    }
    historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [agent.assistantDraft, agent.messages]);

  const analysisModal = agent.analysisOpen ? (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(29,23,19,0.5)] p-4 backdrop-blur-sm"
      role="dialog"
    >
      <Card className="w-full max-w-3xl border-border/80 bg-card/95">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle>Portfolio Analysis</CardTitle>
            <CardDescription>One-shot analysis with fresh portfolio context.</CardDescription>
          </div>
          <Button onClick={agent.closeAnalysis} type="button" variant="ghost">
            Close
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {agent.analysisError ? (
            <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {agent.analysisError}
            </p>
          ) : null}
          <div className="max-h-[60vh] min-h-[180px] overflow-y-auto rounded-[22px] border border-border/70 bg-background/70 p-5 text-sm leading-7">
            {agent.analysisContent || (agent.analysisPending ? "Streaming analysis..." : "No analysis returned.")}
          </div>
        </CardContent>
      </Card>
    </div>
  ) : null;

  if (!open) {
    return analysisModal;
  }

  return (
    <>
      <div className="fixed inset-0 z-40">
        <button
          aria-label="Close analysis drawer"
          className="absolute inset-0 bg-[rgba(29,23,19,0.45)] backdrop-blur-sm"
          onClick={onClose}
          type="button"
        />
      </div>

      <aside
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[28rem] p-3 sm:p-4"
        role="dialog"
      >
        <Card className="flex h-full w-full flex-col overflow-hidden border-secondary/15 bg-card/96">
          <CardHeader className="gap-4 border-b border-border/60 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" />
                  Analysis Desk
                </div>
                <CardTitle className="text-2xl">Portfolio Analyst</CardTitle>
                <CardDescription>
                  Keep commentary off the main desk until you need a deeper read on performance and risk.
                </CardDescription>
              </div>
              <Button aria-label="Close analysis" onClick={onClose} size="icon" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={agent.isConfigured ? "secondary" : "outline"}>
                {agent.isConfigured ? "Configured" : "Setup Required"}
              </Badge>
              <Badge variant="outline">{portfolioId ? "Portfolio Loaded" : "No Portfolio"}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{agent.statusMessage}</p>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-6">
            <div className="flex flex-wrap gap-2">
              <Button disabled={!agent.canAnalyze} onClick={agent.analyzePortfolio} type="button" variant="secondary">
                {agent.analysisPending ? "Analyzing..." : "Analyze Portfolio"}
              </Button>
              <Button disabled={!agent.canClear} onClick={agent.clearHistory} type="button" variant="ghost">
                {agent.clearPending ? "Clearing..." : "Clear Chat"}
              </Button>
            </div>

            {agent.chatError ? (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {agent.chatError}
              </p>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl">Conversation</CardTitle>
                  <CardDescription>Persistent portfolio context per thread.</CardDescription>
                </div>
                <Badge variant="outline">{agent.isConfigured ? agent.badgeLabel : "Unavailable"}</Badge>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border/70 bg-background/55">
                <div className="grid h-full gap-3 overflow-y-auto p-4" ref={historyRef}>
                  {!agent.isConfigured ? (
                    <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                      <p>Agent tools stay hidden until the endpoint is configured.</p>
                    </div>
                  ) : !portfolioId ? (
                    <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                      <p>Select a portfolio to load its chat history.</p>
                    </div>
                  ) : agent.historyLoading ? (
                    <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                      <p>Loading chat history...</p>
                    </div>
                  ) : agent.messages.length ? (
                    agent.messages.map((message) => (
                      <article
                        className={cn(
                          "grid gap-2 rounded-[20px] border px-4 py-4 shadow-sm",
                          message.role === "user"
                            ? "ml-6 border-primary/15 bg-primary text-primary-foreground"
                            : "mr-6 border-border/70 bg-card/85",
                        )}
                        key={message.id}
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]">
                          <strong>{message.role === "user" ? "You" : "Agent"}</strong>
                          <span
                            className={message.role === "user" ? "text-primary-foreground/80" : "text-muted-foreground"}
                          >
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "whitespace-pre-wrap text-sm leading-6",
                            message.role === "user" ? "text-primary-foreground/90" : "text-foreground",
                          )}
                        >
                          {message.content}
                        </p>
                      </article>
                    ))
                  ) : (
                    <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                      <p>Ask about Sharpe drag, benchmark spread, concentration, or what changed after a trade.</p>
                    </div>
                  )}
                  {agent.assistantDraft ? (
                    <article className="mr-6 grid gap-2 rounded-[20px] border border-dashed border-border/80 bg-card/80 px-4 py-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]">
                        <strong>Agent</strong>
                        <span className="text-muted-foreground">Streaming</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">{agent.assistantDraft}</p>
                    </article>
                  ) : null}
                </div>
              </div>

              <form className="space-y-3" onSubmit={agent.submitMessage}>
                <Input
                  aria-label="Agent message"
                  disabled={!agent.isConfigured || !portfolioId || agent.replyPending}
                  onChange={(event) => agent.setInput(event.target.value)}
                  placeholder={
                    portfolioId
                      ? "Ask why Sharpe is low, compare to SPY, or inspect a position."
                      : "Select a portfolio to chat."
                  }
                  value={agent.input}
                />
                <div className="flex justify-end">
                  <Button disabled={!agent.canSend} type="submit">
                    {agent.replyPending ? "Waiting..." : "Send"}
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>
      </aside>

      {analysisModal}
    </>
  );
}
