import type { ApiProtocol } from "../../types";

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
  ];
  const rawProtocol = (input.apiProtocol ?? "anthropic").trim().toLowerCase();
  const apiProtocol = allowed.includes(rawProtocol as ApiProtocol)
    ? (rawProtocol as ApiProtocol)
    : "anthropic";
  pinned = {
    apiProtocol,
    baseUrl: (input.baseUrl?.trim() || "https://api.anthropic.com"),
    model: (input.model?.trim() || "claude-sonnet-4-5"),
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
