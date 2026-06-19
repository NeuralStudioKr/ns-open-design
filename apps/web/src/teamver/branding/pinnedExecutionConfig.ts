import type { ApiProtocol } from "../../types";

export type PinnedTeamverExecutionConfig = {
  apiKey: string;
  apiProtocol: ApiProtocol;
  baseUrl: string;
  model: string;
};

let pinned: PinnedTeamverExecutionConfig | null = null;

/** design-api `/runtime-config` — single source for embed managed BYOK. */
export function pinTeamverExecutionConfig(input: {
  apiKey?: string | null;
  apiProtocol?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}): void {
  const apiKey = input.apiKey?.trim() ?? "";
  if (!apiKey) return;
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
    apiKey,
    apiProtocol,
    baseUrl: (input.baseUrl?.trim() || "https://api.anthropic.com"),
    model: (input.model?.trim() || "claude-sonnet-4-5"),
  };
}

export function getPinnedTeamverExecutionConfig(): PinnedTeamverExecutionConfig | null {
  return pinned;
}

/** Test-only reset. */
export function resetPinnedTeamverExecutionConfigForTests(): void {
  pinned = null;
}
