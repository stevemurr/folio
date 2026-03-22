import { AppSettings, AppSettingsUpdate, BootstrapConfig } from "./types";
import { request } from "./request";

export const appApi = {
  getBootstrap: () => request<BootstrapConfig>("/app/bootstrap"),
  getAppSettings: () => request<AppSettings>("/app/settings"),
  updateAppSettings: (payload: AppSettingsUpdate) =>
    request<AppSettings>("/app/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
