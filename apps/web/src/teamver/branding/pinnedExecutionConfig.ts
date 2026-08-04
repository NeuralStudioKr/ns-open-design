import type { ApiProtocol } from "../../types";
import { FAST_MODEL_BY_PROTOCOL, resolveFixedOriginBaseUrl } from "../../state/apiProtocols";

export type PinnedTeamverExecutionConfig = {
  apiProtocol: ApiProtocol;
  baseUrl: string;
  model: string;
  managedApiConfigured: boolean;
};

let pinned: PinnedTeamverExecutionConfig | null = null;

/** design-api `/runtime-config` — protocol/model prefs only (key stays on server). */
export function pinTeamverExecutionConfig(input: {
  apiProtocol?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  managedApiConfigured?: boolean;
}): void {
  const allowed: ApiProtocol[] = [
    "anthropic",
    "openai",
    "azure",
    "google",
    "ollama",
    "senseaudio",
    "aihubmix",
    "minimax",
  ];
  const rawProtocol = (input.apiProtocol ?? "anthropic").trim().toLowerCase();
  const apiProtocol = allowed.includes(rawProtocol as ApiProtocol)
    ? (rawProtocol as ApiProtocol)
    : "anthropic";
  pinned = {
    apiProtocol,
    baseUrl: resolveFixedOriginBaseUrl(apiProtocol, input.baseUrl?.trim() || "https://api.anthropic.com"),
    model: (input.model?.trim() || FAST_MODEL_BY_PROTOCOL[apiProtocol] || "claude-sonnet-4-6"),
    managedApiConfigured: input.managedApiConfigured === true,
  };
}

export function getPinnedTeamverExecutionConfig(): PinnedTeamverExecutionConfig | null {
  return pinned;
}

/** Test-only reset. */
export function resetPinnedTeamverExecutionConfigForTests(): void {
  pinned = null;
}
