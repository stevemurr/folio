import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiClientError,
  BootstrapConfig,
  ChatHistoryEntry,
  api,
  buildAgentChatUrl,
  streamAgentAnalysis,
} from "../api/client";

type ConnectionState = "disabled" | "idle" | "connecting" | "connected" | "disconnected";

export type AgentMessage = ChatHistoryEntry & {
  pending?: boolean;
};

export function useAgentChat(bootstrap: BootstrapConfig | undefined, portfolioId: string | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const agentConfigured = Boolean(bootstrap?.capabilities.agent);
  const agentReady = agentConfigured && Boolean(portfolioId);

  const historyQuery = useQuery({
    queryKey: ["agent-history", portfolioId],
    queryFn: () => api.getAgentHistory(portfolioId!),
    enabled: agentReady,
    refetchOnWindowFocus: false,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearAgentHistory(portfolioId!),
    onSuccess: async () => {
      setMessages([]);
      setAssistantDraft("");
      setReplyPending(false);
      setChatError(null);
      await queryClient.invalidateQueries({ queryKey: ["agent-history", portfolioId] });
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        setChatError(error.detail.message);
        return;
      }
      setChatError("Unable to clear chat history.");
    },
  });

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    agentConfigured ? "idle" : "disabled",
  );
  const [chatError, setChatError] = useState<string | null>(null);
  const [replyPending, setReplyPending] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisContent, setAnalysisContent] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentConfigured) {
      setConnectionState("disabled");
      setMessages([]);
      setAssistantDraft("");
      return;
    }
    if (!portfolioId) {
      setConnectionState("idle");
      setMessages([]);
      setAssistantDraft("");
      return;
    }
    if (historyQuery.data) {
      setMessages(historyQuery.data);
      setAssistantDraft("");
      setReplyPending(false);
    }
  }, [agentConfigured, historyQuery.data, portfolioId]);

  useEffect(() => {
    if (!historyQuery.isError) {
      return;
    }
    if (historyQuery.error instanceof ApiClientError) {
      setChatError(historyQuery.error.detail.message);
      return;
    }
    setChatError("Unable to load chat history.");
  }, [historyQuery.error, historyQuery.isError]);

  useEffect(() => {
    if (!agentConfigured) {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }
    if (!portfolioId) {
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }
      setConnectionState("connecting");
      const socket = new WebSocket(buildAgentChatUrl(portfolioId));
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectTimerRef.current = null;
        setConnectionState("connected");
        setChatError(null);
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as
          | {
              type: string;
              delta?: string;
              message?: ChatHistoryEntry;
              detail?: { message?: string };
            }
          | undefined;

        if (!payload) {
          return;
        }

        if (payload.type === "assistant_start") {
          setAssistantDraft("");
          setReplyPending(true);
          return;
        }

        if (payload.type === "assistant_delta" && payload.delta) {
          setAssistantDraft((current) => current + payload.delta);
          return;
        }

        if (payload.type === "assistant_message" && payload.message) {
          const assistantMessage = payload.message;
          setMessages((current) => [...current, assistantMessage]);
          setAssistantDraft("");
          setReplyPending(false);
          return;
        }

        if (payload.type === "error") {
          setAssistantDraft("");
          setReplyPending(false);
          setChatError(payload.detail?.message ?? "Agent request failed.");
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (cancelled) {
          return;
        }
        setConnectionState("disconnected");
        setReplyPending(false);
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [agentConfigured, portfolioId]);

  async function analyzePortfolio() {
    if (!portfolioId) {
      return;
    }

    setAnalysisOpen(true);
    setAnalysisPending(true);
    setAnalysisError(null);
    setAnalysisContent("");

    try {
      await streamAgentAnalysis(portfolioId, {
        onMessage: (delta) => {
          setAnalysisContent((current) => current + delta);
        },
        onDone: (message) => {
          if (message) {
            setAnalysisContent(message);
          }
        },
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setAnalysisError(error.detail.message);
      } else {
        setAnalysisError("Unable to analyze this portfolio.");
      }
    } finally {
      setAnalysisPending(false);
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolioId) {
      return;
    }
    const content = input.trim();
    if (!content) {
      return;
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setChatError("Waiting for the agent connection.");
      return;
    }

    const optimisticMessage: AgentMessage = {
      id: `local-${Date.now()}`,
      portfolio_id: portfolioId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimisticMessage]);
    setInput("");
    setAssistantDraft("");
    setReplyPending(true);
    setChatError(null);
    socketRef.current.send(JSON.stringify({ type: "message", content }));
  }

  function clearHistory() {
    if (!portfolioId || clearMutation.isPending) {
      return;
    }
    clearMutation.mutate();
  }

  function closeAnalysis() {
    setAnalysisOpen(false);
  }

  const statusMessage = !agentConfigured
    ? "Add an OpenAI-compatible endpoint to ~/.folio/config.yaml to enable analysis."
    : !portfolioId
      ? "Select a portfolio to start analysis and persistent chat."
      : connectionState === "connected"
        ? "Portfolio context is live. Chat history is stored per portfolio."
        : connectionState === "connecting"
          ? "Connecting to the configured agent endpoint."
          : connectionState === "idle"
            ? "Preparing agent chat."
            : "Connection dropped. Reconnecting automatically.";

  const badgeLabel = !agentConfigured
    ? "Setup Required"
    : connectionState === "connected"
      ? "Live"
      : connectionState === "connecting"
        ? "Connecting"
        : connectionState === "disconnected"
          ? "Reconnecting"
          : "Configured";

  return {
    analysisContent,
    analysisError,
    analysisOpen,
    analysisPending,
    assistantDraft,
    badgeLabel,
    chatError,
    clearHistory,
    connectionState,
    historyLoading: historyQuery.isLoading,
    input,
    isConfigured: agentConfigured,
    messages,
    replyPending,
    setInput,
    statusMessage,
    submitMessage,
    clearPending: clearMutation.isPending,
    analyzePortfolio,
    closeAnalysis,
    canAnalyze: agentReady && !analysisPending,
    canClear: agentReady && !clearMutation.isPending && messages.length > 0,
    canSend: agentReady && connectionState === "connected" && !replyPending && input.trim().length > 0,
  };
}
