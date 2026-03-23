import {
  SimulationAgentDetail,
  SimulationCreateRequest,
  SimulationResults,
  SimulationSummary,
} from "./types";
import { request } from "./request";

export const simulationApi = {
  createSimulation: (workspaceId: string, payload: SimulationCreateRequest) =>
    request<SimulationSummary>(`/workspaces/${workspaceId}/simulations`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listSimulations: (workspaceId: string, signal?: AbortSignal) =>
    request<SimulationSummary[]>(`/workspaces/${workspaceId}/simulations`, { signal }),

  getSimulation: (simulationId: string, signal?: AbortSignal) =>
    request<SimulationSummary>(`/simulations/${simulationId}`, { signal }),

  getSimulationResults: (simulationId: string, signal?: AbortSignal) =>
    request<SimulationResults>(`/simulations/${simulationId}/results`, { signal }),

  getSimulationAgent: (simulationId: string, agentId: string, signal?: AbortSignal) =>
    request<SimulationAgentDetail>(`/simulations/${simulationId}/agents/${agentId}`, { signal }),

  deleteSimulation: (simulationId: string) =>
    request<void>(`/simulations/${simulationId}`, { method: "DELETE" }),
};
