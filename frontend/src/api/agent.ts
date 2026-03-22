import { ChatHistoryEntry } from "./types";
import { ApiClientError, request, requestErrorDetail } from "./request";

function parseSseEvent(rawEvent: string): { event: string; data: string } | null {
  const normalized = rawEvent.replace(/\r/g, "");
  const lines = normalized.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export async function streamAgentAnalysis(
  portfolioId: string,
  handlers: {
    onMessage?: (delta: string) => void;
    onDone?: (message: string) => void;
  },
): Promise<void> {
  const response = await fetch("/api/v1/agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ portfolio_id: portfolioId }),
  });

  if (!response.ok) {
    throw new ApiClientError(response.status, await requestErrorDetail(response));
  }

  if (!response.body) {
    throw new ApiClientError(500, {
      code: "stream_unavailable",
      message: "Streaming is unavailable in this browser.",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r/g, "");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseEvent(rawEvent);
      if (parsed) {
        let payload:
          | {
              delta?: string;
              message?: string;
              code?: string;
            }
          | undefined;
        try {
          payload = JSON.parse(parsed.data) as
            | { delta?: string; message?: string; code?: string }
            | undefined;
        } catch {
          payload = undefined;
        }
        if (parsed.event === "message" && payload?.delta) {
          handlers.onMessage?.(payload.delta);
        }
        if (parsed.event === "done") {
          handlers.onDone?.(payload?.message ?? "");
        }
        if (parsed.event === "error") {
          throw new ApiClientError(502, {
            code: payload?.code ?? "agent_stream_error",
            message: payload?.message ?? "The configured agent returned an error.",
          });
        }
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }
}

export function buildAgentChatUrl(portfolioId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/v1/agent/chat?portfolio_id=${encodeURIComponent(portfolioId)}`;
}

export const agentApi = {
  getAgentHistory: (portfolioId: string) =>
    request<ChatHistoryEntry[]>(`/agent/history/${encodeURIComponent(portfolioId)}`),
  clearAgentHistory: (portfolioId: string) =>
    request<void>(`/agent/history/${encodeURIComponent(portfolioId)}`, { method: "DELETE" }),
};
