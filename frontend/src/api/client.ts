export * from "./types";
export { ApiClientError } from "./request";
export { buildAgentChatUrl, streamAgentAnalysis } from "./agent";

import { agentApi } from "./agent";
import { appApi } from "./app";
import { marketApi } from "./market";
import { workspaceApi } from "./workspaces";

export const api = {
  ...appApi,
  ...workspaceApi,
  ...marketApi,
  ...agentApi,
};
