import { useEffect, useRef } from "react";

import { BootstrapConfig } from "../api/client";
import { useAgentChat } from "../hooks/useAgentChat";

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
    <aside className="agent-rail">
      <div className="panel-header">
        <div>
          <h2>Agent Sidebar</h2>
          <p>Portfolio-aware chat with persisted history and streaming analysis.</p>
        </div>
      </div>
      <div className="agent-card">
        <div className="agent-badge">{agent.isConfigured ? "Configured" : "Setup Required"}</div>
        <p>{agent.statusMessage}</p>
        <div className="agent-actions">
          <button
            className="secondary-button"
            disabled={!agent.canAnalyze}
            onClick={agent.analyzePortfolio}
            type="button"
          >
            {agent.analysisPending ? "Analyzing..." : "Analyze Portfolio"}
          </button>
          <button
            className="ghost-button"
            disabled={!agent.canClear}
            onClick={agent.clearHistory}
            type="button"
          >
            {agent.clearPending ? "Clearing..." : "Clear Chat"}
          </button>
        </div>
      </div>

      <div className="agent-history">
        <div className="agent-history-header">
          <strong>Conversation</strong>
          <span>{agent.isConfigured ? agent.badgeLabel : "Unavailable"}</span>
        </div>
        {agent.chatError ? <p className="error-banner">{agent.chatError}</p> : null}
        <div className="chat-scroll" ref={historyRef}>
          {!agent.isConfigured ? (
            <div className="agent-history-placeholder">
              <p>Agent tools stay hidden until the endpoint is configured.</p>
            </div>
          ) : !portfolioId ? (
            <div className="agent-history-placeholder">
              <p>Select a portfolio to load its chat history.</p>
            </div>
          ) : agent.historyLoading ? (
            <div className="agent-history-placeholder">
              <p>Loading chat history...</p>
            </div>
          ) : agent.messages.length ? (
            agent.messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <div className="chat-message-header">
                  <strong>{message.role === "user" ? "You" : "Agent"}</strong>
                  <span>
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <div className="agent-history-placeholder">
              <p>Ask the agent about performance, Sharpe drag, concentration, or benchmark comparison.</p>
            </div>
          )}
          {agent.assistantDraft ? (
            <article className="chat-message assistant draft">
              <div className="chat-message-header">
                <strong>Agent</strong>
                <span>Streaming</span>
              </div>
              <p>{agent.assistantDraft}</p>
            </article>
          ) : null}
        </div>
        <form className="chat-composer" onSubmit={agent.submitMessage}>
          <input
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
          <div className="agent-actions">
            <button className="primary-button" disabled={!agent.canSend} type="submit">
              {agent.replyPending ? "Waiting..." : "Send"}
            </button>
          </div>
        </form>
      </div>

      {agent.analysisOpen ? (
        <div className="modal-scrim" role="presentation">
          <div className="modal-card analysis-modal">
            <div className="panel-header">
              <div>
                <h2>Portfolio Analysis</h2>
                <p>One-shot analysis with fresh portfolio context.</p>
              </div>
              <button className="ghost-button" onClick={agent.closeAnalysis} type="button">
                Close
              </button>
            </div>
            {agent.analysisError ? <p className="error-banner">{agent.analysisError}</p> : null}
            <div className="analysis-body">
              {agent.analysisContent || (agent.analysisPending ? "Streaming analysis..." : "No analysis returned.")}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
