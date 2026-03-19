import { BootstrapConfig } from "../api/client";
import { useAgentChat } from "../hooks/useAgentChat";

type Props = {
  bootstrap: BootstrapConfig;
};

export default function AgentSidebar({ bootstrap }: Props) {
  const agent = useAgentChat(bootstrap);

  return (
    <aside className="agent-rail">
      <div className="panel-header">
        <div>
          <h2>Agent Sidebar</h2>
          <p>Persistent analysis stays capability-gated in the MVP.</p>
        </div>
      </div>
      <div className="agent-card">
        <div className="agent-badge">{agent.enabled ? "Configured" : "Setup Required"}</div>
        <p>{agent.statusMessage}</p>
        <button className="secondary-button" disabled type="button">
          Analyze Portfolio
        </button>
      </div>
      <div className="agent-history-placeholder">
        <p>Chat history will appear here when the local LLM endpoint is configured.</p>
      </div>
    </aside>
  );
}

