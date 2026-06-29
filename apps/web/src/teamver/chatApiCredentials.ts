import type { AppConfig } from "../types";
import { isTeamverExecutionConfigLocked } from "./branding/applyEmbedConfigLock";
import { isTeamverEmbedMode } from "./designApiBase";

/** True when API-mode chat can run (user BYOK or server-managed embed key). */
export function hasChatApiCredentials(config: Pick<AppConfig, "apiKey" | "apiKeyConfigured">): boolean {
  if (config.apiKey?.trim()) return true;
  if (isTeamverEmbedMode() && isTeamverExecutionConfigLocked()) return true;
  return Boolean(config.apiKeyConfigured && isTeamverEmbedMode());
}

/** Embed managed BYOK — daemon injects TEAMVER_OD_API_KEY; browser never sends the secret. */
export function usesServerManagedChatApiKey(
  config: Pick<AppConfig, "apiKey" | "apiKeyConfigured">,
): boolean {
  if (config.apiKey?.trim()) return false;
  if (isTeamverEmbedMode() && isTeamverExecutionConfigLocked()) return true;
  return Boolean(isTeamverEmbedMode() && config.apiKeyConfigured);
}
