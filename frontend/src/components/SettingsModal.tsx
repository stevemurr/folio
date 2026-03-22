import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

import { ApiClientError, AppSettings, api } from "../api/client";
import ModalShell from "./ui/modal-shell";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  open: boolean;
  settings: AppSettings | undefined;
  onClose: () => void;
};

type FormState = {
  market: AppSettings["market"];
  agent: AppSettings["agent"];
  scheduler: AppSettings["scheduler"];
  realEstate: AppSettings["real_estate"];
};

function toFormState(settings: AppSettings): FormState {
  return {
    market: { ...settings.market },
    agent: { ...settings.agent },
    scheduler: { ...settings.scheduler },
    realEstate: { ...settings.real_estate },
  };
}

export default function SettingsModal({ open, settings, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(settings ? toFormState(settings) : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings) {
      setForm(toFormState(settings));
      setError(null);
    }
  }, [open, settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("Settings are unavailable.");
      }
      return api.updateAppSettings({
        market: {
          risk_free_rate: form.market.risk_free_rate,
          benchmark_ticker: form.market.benchmark_ticker,
          cache_ttl_days: form.market.cache_ttl_days,
        },
        agent: {
          endpoint: form.agent.endpoint,
          model: form.agent.model,
          api_key: form.agent.api_key,
          max_tokens: form.agent.max_tokens,
          temperature: form.agent.temperature,
        },
        scheduler: {
          enabled: form.scheduler.enabled,
          price_refresh_cron: form.scheduler.price_refresh_cron,
          zillow_refresh_cron: form.scheduler.zillow_refresh_cron,
        },
        real_estate: {
          enabled: form.realEstate.enabled,
          metro_csv_url: form.realEstate.metro_csv_url,
          zip_csv_url: form.realEstate.zip_csv_url,
          cache_ttl_days: form.realEstate.cache_ttl_days,
          search_limit: form.realEstate.search_limit,
        },
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(["app-settings"], updated);
      queryClient.setQueryData(["bootstrap"], {
        risk_free_rate: updated.market.risk_free_rate,
        benchmark_ticker: updated.market.benchmark_ticker,
        capabilities: updated.capabilities,
      });

      const marketChanged =
        settings?.market.benchmark_ticker !== updated.market.benchmark_ticker ||
        settings?.market.risk_free_rate !== updated.market.risk_free_rate;

      if (marketChanged) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workspace-view"] }),
          queryClient.invalidateQueries({ queryKey: ["book-snapshot"] }),
        ]);
      }
      onClose();
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiClientError) {
        setError(mutationError.detail.message);
        return;
      }
      setError("Unable to save settings.");
    },
  });

  if (!open || !settings || !form) {
    return null;
  }

  function updateNumber<T extends keyof FormState>(section: T, field: keyof FormState[T]) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setForm((current) =>
        current
          ? {
              ...current,
              [section]: {
                ...current[section],
                [field]: Number.isFinite(value) ? value : 0,
              },
            }
          : current,
      );
    };
  }

  function updateText<T extends keyof FormState>(section: T, field: keyof FormState[T]) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) =>
        current
          ? {
              ...current,
              [section]: {
                ...current[section],
                [field]: value,
              },
            }
          : current,
      );
    };
  }

  function updateBool<T extends keyof FormState>(section: T, field: keyof FormState[T]) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setForm((current) =>
        current
          ? {
              ...current,
              [section]: {
                ...current[section],
                [field]: checked,
              },
            }
          : current,
      );
    };
  }

  return (
    <ModalShell contentClassName="max-w-4xl" open={open}>
      <Card className="surface-panel flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden border-border/80 shadow-panel">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 pb-5">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-[12px] border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              Runtime Settings
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl leading-tight sm:text-3xl">Tune the runtime defaults.</CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground">
              These values are stored in the database via <code>app_config</code> and override the file config.
              </CardDescription>
            </div>
          </div>
          <Button aria-label="Close settings" onClick={onClose} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
          </CardHeader>
        <CardContent className="grid min-h-0 gap-6 overflow-y-auto pt-6">
          <div className="surface-panel-muted grid gap-4 rounded-[24px] border border-border/70 p-5 sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Database</div>
              <div className="mt-2 text-sm">{settings.database.engine}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Path</div>
              <div className="mt-2 break-all text-sm">{settings.database.path}</div>
            </div>
          </div>

          <section className="surface-panel-muted grid gap-4 rounded-[24px] border border-border/70 p-5">
            <div>
              <h3 className="text-xl">Market</h3>
              <p className="text-sm text-muted-foreground">Benchmark and cache behavior for portfolio analytics.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">
                <span>Benchmark</span>
                <Input value={form.market.benchmark_ticker} onChange={updateText("market", "benchmark_ticker")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Risk-Free Rate</span>
                <Input
                  inputMode="decimal"
                  value={String(form.market.risk_free_rate)}
                  onChange={updateNumber("market", "risk_free_rate")}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Cache TTL Days</span>
                <Input
                  inputMode="numeric"
                  value={String(form.market.cache_ttl_days)}
                  onChange={updateNumber("market", "cache_ttl_days")}
                />
              </label>
            </div>
          </section>

          <section className="surface-panel-muted grid gap-4 rounded-[24px] border border-border/70 p-5">
            <div>
              <h3 className="text-xl">Agent</h3>
              <p className="text-sm text-muted-foreground">OpenAI-compatible endpoint and completion defaults.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                <span>Endpoint</span>
                <Input value={form.agent.endpoint} onChange={updateText("agent", "endpoint")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Model</span>
                <Input value={form.agent.model} onChange={updateText("agent", "model")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>API Key</span>
                <Input value={form.agent.api_key} onChange={updateText("agent", "api_key")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Max Tokens</span>
                <Input
                  inputMode="numeric"
                  value={String(form.agent.max_tokens)}
                  onChange={updateNumber("agent", "max_tokens")}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Temperature</span>
                <Input
                  inputMode="decimal"
                  value={String(form.agent.temperature)}
                  onChange={updateNumber("agent", "temperature")}
                />
              </label>
            </div>
          </section>

          <section className="surface-panel-muted grid gap-4 rounded-[24px] border border-border/70 p-5">
            <div>
              <h3 className="text-xl">Scheduler</h3>
              <p className="text-sm text-muted-foreground">Cron strings are applied immediately after save.</p>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input checked={form.scheduler.enabled} onChange={updateBool("scheduler", "enabled")} type="checkbox" />
              Enable background refresh jobs
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                <span>Stock Refresh Cron</span>
                <Input value={form.scheduler.price_refresh_cron} onChange={updateText("scheduler", "price_refresh_cron")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Zillow Refresh Cron</span>
                <Input
                  value={form.scheduler.zillow_refresh_cron}
                  onChange={updateText("scheduler", "zillow_refresh_cron")}
                />
              </label>
            </div>
          </section>

          <section className="surface-panel-muted grid gap-4 rounded-[24px] border border-border/70 p-5">
            <div>
              <h3 className="text-xl">Real Estate</h3>
              <p className="text-sm text-muted-foreground">Zillow CSV sources for metro and ZIP-level simulated assets.</p>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input checked={form.realEstate.enabled} onChange={updateBool("realEstate", "enabled")} type="checkbox" />
              Enable Zillow-backed real-estate search and `RE:` assets
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                <span>Metro CSV URL</span>
                <Input value={form.realEstate.metro_csv_url} onChange={updateText("realEstate", "metro_csv_url")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                <span>ZIP CSV URL</span>
                <Input value={form.realEstate.zip_csv_url} onChange={updateText("realEstate", "zip_csv_url")} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Cache TTL Days</span>
                <Input
                  inputMode="numeric"
                  value={String(form.realEstate.cache_ttl_days)}
                  onChange={updateNumber("realEstate", "cache_ttl_days")}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Search Limit</span>
                <Input
                  inputMode="numeric"
                  value={String(form.realEstate.search_limit)}
                  onChange={updateNumber("realEstate", "search_limit")}
                />
              </label>
            </div>
          </section>

          {error ? (
            <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="sticky bottom-0 justify-end border-t border-border/60 bg-card/95 pt-4 backdrop-blur-sm">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()} type="button">
            {mutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </CardFooter>
      </Card>
    </ModalShell>
  );
}
