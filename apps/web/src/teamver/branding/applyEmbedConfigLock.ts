import type { ApiProtocol, AppConfig } from "../../types";
import { resolveFixedOriginBaseUrl } from "../../state/apiProtocols";
import { resolveTeamverBranding } from "./config";

function readEnv(key: string): string | undefined {
  return (import.meta.env[key] as string | undefined)?.trim() || undefined;
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
export function applyTeamverEmbedConfigLockIfNeeded(config: AppConfig): AppConfig {
  const branding = resolveTeamverBranding();
  if (!branding.enabled || !branding.lockExecutionConfig) {
    return config;
  }

  const fixedProtocol = readFixedProtocol();
  const fixedModel = readEnv("VITE_TEAMVER_API_MODEL");
  const fixedBaseUrl = readEnv("VITE_TEAMVER_API_BASE_URL");
  const protocol = fixedProtocol ?? config.apiProtocol ?? "anthropic";
  const baseUrl = resolveFixedOriginBaseUrl(
    protocol,
    fixedBaseUrl ?? config.baseUrl,
  );

  const next: AppConfig = {
    ...config,
    mode: "api",
    onboardingCompleted: true,
    agentId: null,
    agentModels: {},
    agentCliEnv: {},
    apiProtocol: protocol,
    baseUrl,
    ...(fixedModel ? { model: fixedModel } : {}),
  };

  if (
    next.mode === config.mode
    && next.onboardingCompleted === config.onboardingCompleted
    && next.agentId === config.agentId
    && next.apiProtocol === config.apiProtocol
    && next.baseUrl === config.baseUrl
    && next.model === config.model
    && Object.keys(next.agentModels ?? {}).length === Object.keys(config.agentModels ?? {}).length
    && Object.keys(next.agentCliEnv ?? {}).length === Object.keys(config.agentCliEnv ?? {}).length
  ) {
    return config;
  }

  return next;
}
