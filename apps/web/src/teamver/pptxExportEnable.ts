import { readTeamverViteEnv } from "./teamverViteEnv";

const TRUTHY = new Set(["true", "1", "yes", "on"]);

function parseEnvFlag(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

/**
 * PPTX download / Drive publish — prd off by default.
 * Staging sets `VITE_TEAMVER_PPTX_EXPORT_ENABLE=true` at Docker build.
 * Standalone (non-embed) OD keeps PPTX available.
 */
export function isTeamverPptxExportEnabled(options?: { embed?: boolean }): boolean {
  const embed = options?.embed === true;
  if (!embed) return true;
  return parseEnvFlag(readTeamverViteEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE"));
}
