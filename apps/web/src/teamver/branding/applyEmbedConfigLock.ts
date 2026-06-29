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
 * Embed 모드에서 server-managed runtime↔LocalCLI 전환·onboarding 재진입으로 인한 설정 drift를 막는다.
 * apiKey는 브라우저에 저장/전송하지 않는다. API-mode proxy 요청은
 * useManagedApiKey=true만 보내고 daemon이 TEAMVER_OD_API_KEY를 주입한다.
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
  // Embed with execution lock always uses server-managed BYOK — do not wait on
  // runtime-config / pin before marking credentials ready. Without this, a
  // boot race (or a failed runtime-config fetch) leaves apiKeyConfigured
  // false and streamProxyEndpoint bails before POST /api/proxy/*/stream.
  const apiKeyConfigured = branding.lockExecutionConfig
    ? true
    : Boolean(pinned?.managedApiConfigured || config.apiKeyConfigured);
  const apiKey = "";
  const mode = "api";

  // Embed: skip OD first-run privacy modal — Teamver signup covers legal consent.
  // Persist an explicit OD telemetry opt-out (usage attribution goes via BFF).
  const autoAckOpenDesignPrivacy = config.privacyDecisionAt == null;

  const next: AppConfig = {
    ...config,
    mode,
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
    ...(autoAckOpenDesignPrivacy
      ? {
          privacyDecisionAt: Date.now(),
          installationId: undefined,
          telemetry: {
            metrics: false,
            content: false,
            artifactManifest: false,
          },
        }
      : {}),
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
