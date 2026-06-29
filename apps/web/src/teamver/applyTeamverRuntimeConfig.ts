import type { ApiProtocol, AppConfig } from "../types";
import { pinTeamverExecutionConfig } from "./branding/pinnedExecutionConfig";
import { fetchTeamverRuntimeConfig } from "./designBffClient";

export type TeamverRuntimeConfig = {
  configured: boolean;
  /** Raw protocol from design-api / env — normalized inside merge. */
  apiProtocol?: string;
  baseUrl?: string;
  model?: string;
  /** Server has a managed key — never accompanied by apiKey in the response. */
  apiKeyConfigured?: boolean;
};

const ALLOWED_PROTOCOLS: readonly ApiProtocol[] = [
  "anthropic",
  "openai",
  "azure",
  "google",
  "ollama",
  "senseaudio",
  "aihubmix",
];

function normalizeProtocol(raw: string | undefined): ApiProtocol | undefined {
  if (!raw) return undefined;
  return ALLOWED_PROTOCOLS.includes(raw as ApiProtocol)
    ? (raw as ApiProtocol)
    : undefined;
}

/** Merge design-api runtime-config into local AppConfig (embed managed BYOK). */
export function mergeTeamverRuntimeConfigIntoAppConfig(
  config: AppConfig,
  runtime: TeamverRuntimeConfig | null | undefined,
): AppConfig {
  if (!runtime?.configured) return config;
  if (!runtime.apiKeyConfigured) return config;

  const apiProtocol = normalizeProtocol(runtime.apiProtocol) ?? config.apiProtocol ?? "anthropic";
  const baseUrl = runtime.baseUrl?.trim() || config.baseUrl;
  const model = runtime.model?.trim() || config.model;

  pinTeamverExecutionConfig({ apiProtocol, baseUrl, model, managedApiConfigured: true });

  if (
    !config.apiKey?.trim()
    && config.apiKeyConfigured
    && config.apiProtocol === apiProtocol
    && config.baseUrl === baseUrl
    && config.model === model
    && config.mode === "api"
    && Object.keys(config.apiProtocolConfigs ?? {}).length === 0
  ) {
    return config;
  }

  return {
    ...config,
    mode: "api",
    apiKey: "",
    apiKeyConfigured: true,
    apiProtocol,
    baseUrl,
    model,
    apiProtocolConfigs: {},
  };
}

/**
 * Re-fetch design-api `runtime-config` and merge into `baseConfig`. Returns
 * the same reference when nothing changed so callers can skip persist/state
 * writes. Used on workspace switch and `pageshow` to recover from BE env
 * changes without a full reload.
 */
export async function reloadTeamverRuntimeConfigIntoAppConfig(
  baseConfig: AppConfig,
): Promise<AppConfig> {
  const runtime = await fetchTeamverRuntimeConfig();
  if (!runtime?.configured) return baseConfig;
  return mergeTeamverRuntimeConfigIntoAppConfig(baseConfig, runtime);
}
