import type { ApiProtocol, AppConfig } from "../types";
import { pinTeamverExecutionConfig } from "./branding/pinnedExecutionConfig";

export type TeamverRuntimeConfig = {
  configured: boolean;
  /** Raw protocol from design-api / env — normalized inside merge. */
  apiProtocol?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
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
  const apiKey = runtime.apiKey?.trim() ?? "";
  if (!apiKey) return config;

  const apiProtocol = normalizeProtocol(runtime.apiProtocol) ?? config.apiProtocol ?? "anthropic";
  const baseUrl = runtime.baseUrl?.trim() || config.baseUrl;
  const model = runtime.model?.trim() || config.model;

  pinTeamverExecutionConfig({ apiKey, apiProtocol, baseUrl, model });

  if (
    config.apiKey === apiKey
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
    apiKey,
    apiProtocol,
    baseUrl,
    model,
    apiProtocolConfigs: {},
  };
}
