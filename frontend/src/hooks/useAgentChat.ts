import { useMemo } from "react";

import { BootstrapConfig } from "../api/client";

export function useAgentChat(bootstrap?: BootstrapConfig) {
  return useMemo(
    () => ({
      enabled: Boolean(bootstrap?.capabilities.agent),
      statusMessage: bootstrap?.capabilities.agent
        ? "Agent connectivity can be added from config."
        : "Add an OpenAI-compatible endpoint to ~/.folio/config.yaml to enable analysis.",
    }),
    [bootstrap],
  );
}

