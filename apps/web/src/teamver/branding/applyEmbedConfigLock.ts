import type { ApiProtocol, AppConfig } from "../../types";
import { resolveFixedOriginBaseUrl } from "../../state/apiProtocols";
import { readTeamverViteEnv } from "../teamverViteEnv";
import { resolveTeamverBranding } from "./config";
import { getPinnedTeamverExecutionConfig } from "./pinnedExecutionConfig";

function readEnv(key: string): string | undefined {
  return readTeamverViteEnv(key);
}

function readFixedProtocol(): ApiProtocol | undefined {
  const raw = readEnv("VITE_TEAMVER_API_PROTOCOL");
  if (!raw) return undefined;
  const allowed: ApiProtocol[] = [
    "anthropic",
    "openai",
    "azure",
    "google",
    "ollama",
    "senseaudio",
    "aihubmix",
  ];
  return allowed.includes(raw as ApiProtocol) ? (raw as ApiProtocol) : undefined;
}

/**
 * Embed 모드에서 BYOK↔LocalCLI 전환·onboarding 재진입으로 인한 설정 drift를 막는다.
 * apiKey는 daemon/localStorage merge 결과를 유지한다 (브라우저 env 주입 금지).
 */
export function isTeamverExecutionConfigLocked(): boolean {
  const branding = resolveTeamverBranding();
  return branding.enabled && branding.lockExecutionConfig;
}

export function applyTeamverEmbedConfigLockIfNeeded(config: AppConfig): AppConfig {
  const branding = resolveTeamverBranding();
  if (!branding.enabled || !branding.lockExecutionConfig) {
    return config;
  }

  const pinned = getPinnedTeamverExecutionConfig();
  const fixedProtocol = readFixedProtocol();
  const fixedModel = readEnv("VITE_TEAMVER_API_MODEL")?.trim();
  const fixedBaseUrl = readEnv("VITE_TEAMVER_API_BASE_URL")?.trim();
  const protocol =
    fixedProtocol ?? pinned?.apiProtocol ?? config.apiProtocol ?? "anthropic";
  const baseUrl = resolveFixedOriginBaseUrl(
    protocol,
    fixedBaseUrl ?? pinned?.baseUrl ?? config.baseUrl,
  );
  const model = fixedModel ?? pinned?.model ?? config.model;
  const apiKeyConfigured = pinned?.managedApiConfigured || config.apiKeyConfigured;
  const apiKey = apiKeyConfigured ? "" : config.apiKey;

  const next: AppConfig = {
    ...config,
    mode: "api",
    onboardingCompleted: true,
    agentId: null,
    agentModels: {},
    agentCliEnv: {},
    apiProtocol: protocol,
    baseUrl,
    model,
    apiKey,
    apiKeyConfigured,
    // Per-protocol shadow copies let the picker drift; embed uses one server profile.
    apiProtocolConfigs: {},
  };

  if (
    next.mode === config.mode
    && next.onboardingCompleted === config.onboardingCompleted
    && next.agentId === config.agentId
    && next.apiProtocol === config.apiProtocol
    && next.baseUrl === config.baseUrl
    && next.model === config.model
    && next.apiKey === config.apiKey
    && next.apiKeyConfigured === config.apiKeyConfigured
    && Object.keys(next.agentModels ?? {}).length === Object.keys(config.agentModels ?? {}).length
    && Object.keys(next.agentCliEnv ?? {}).length === Object.keys(config.agentCliEnv ?? {}).length
    && Object.keys(next.apiProtocolConfigs ?? {}).length
      === Object.keys(config.apiProtocolConfigs ?? {}).length
  ) {
    return config;
  }

  return next;
}
