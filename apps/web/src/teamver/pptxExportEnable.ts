import { readTeamverViteEnv } from "./teamverViteEnv";

const FALSY = new Set(["false", "0", "no", "off"]);

function isExplicitlyDisabled(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const value = String(raw).trim().toLowerCase();
  if (!value) return false;
  return FALSY.has(value);
}

/**
 * PPTX download / Drive publish PPTX — on by default (including prd embed).
 * Set `VITE_TEAMVER_PPTX_EXPORT_ENABLE=false` to hide. Standalone OD always on.
 */
export function isTeamverPptxExportEnabled(options?: { embed?: boolean }): boolean {
  const embed = options?.embed === true;
  if (!embed) return true;
  return !isExplicitlyDisabled(readTeamverViteEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE"));
}
