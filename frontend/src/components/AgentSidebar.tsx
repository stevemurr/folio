import { useEffect, useRef } from "react";

import { BootstrapConfig } from "../api/client";
import { cn } from "../lib/utils";
import { useAgentChat } from "../hooks/useAgentChat";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  bootstrap: BootstrapConfig;
  portfolioId: string | null;
};

export default function AgentSidebar({ bootstrap, portfolioId }: Props) {
  const agent = useAgentChat(bootstrap, portfolioId);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!historyRef.current) {
      return;
    }
    historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [agent.assistantDraft, agent.messages]);

  return (
    <aside className="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
      <Card className="border-secondary/10 bg-card/80">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Agent Sidebar</CardTitle>
            <Badge variant={agent.isConfigured ? "secondary" : "outline"}>
              {agent.isConfigured ? "Configured" : "Setup Required"}
            </Badge>
          </div>
          <CardDescription>Portfolio-aware chat with persisted history and streaming analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{agent.statusMessage}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!agent.canAnalyze}
              onClick={agent.analyzePortfolio}
              type="button"
            >
              {agent.analysisPending ? "Analyzing..." : "Analyze Portfolio"}
            </Button>
            <Button
              variant="ghost"
              disabled={!agent.canClear}
              onClick={agent.clearHistory}
              type="button"
            >
              {agent.clearPending ? "Clearing..." : "Clear Chat"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-xl">Conversation</CardTitle>
            <CardDescription>Persistent portfolio context per thread.</CardDescription>
          </div>
          <Badge variant="outline">{agent.isConfigured ? agent.badgeLabel : "Unavailable"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {agent.chatError ? (
            <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {agent.chatError}
            </p>
          ) : null}
          <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1" ref={historyRef}>
            {!agent.isConfigured ? (
              <div className="grid min-h-[220px] place-items-center rounded-[28px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                <p>Agent tools stay hidden until the endpoint is configured.</p>
              </div>
            ) : !portfolioId ? (
              <div className="grid min-h-[220px] place-items-center rounded-[28px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                <p>Select a portfolio to load its chat history.</p>
              </div>
            ) : agent.historyLoading ? (
              <div className="grid min-h-[220px] place-items-center rounded-[28px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                <p>Loading chat history...</p>
              </div>
            ) : agent.messages.length ? (
              agent.messages.map((message) => (
                <article
                  className={cn(
                    "grid gap-2 rounded-[24px] border px-4 py-4 shadow-sm",
                    message.role === "user"
                      ? "ml-6 border-primary/15 bg-primary text-primary-foreground"
                      : "mr-6 border-border/70 bg-background/80",
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
              <div className="grid min-h-[220px] place-items-center rounded-[28px] border border-dashed border-border/70 bg-background/40 px-6 text-center text-sm text-muted-foreground">
                <p>Ask the agent about performance, Sharpe drag, concentration, or benchmark comparison.</p>
              </div>
            )}
            {agent.assistantDraft ? (
              <article className="mr-6 grid gap-2 rounded-[24px] border border-dashed border-border/80 bg-background/80 px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]">
                  <strong>Agent</strong>
                  <span className="text-muted-foreground">Streaming</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">{agent.assistantDraft}</p>
              </article>
            ) : null}
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
        </CardContent>
      </Card>

      {agent.analysisOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(42,28,22,0.42)] p-4 backdrop-blur-sm"
          role="dialog"
        >
          <Card className="w-full max-w-3xl">
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
              <div className="max-h-[60vh] min-h-[180px] overflow-y-auto rounded-[28px] border border-border/70 bg-background/70 p-5 text-sm leading-7">
                {agent.analysisContent || (agent.analysisPending ? "Streaming analysis..." : "No analysis returned.")}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </aside>
  );
}
