/**
 * PPTX download / Drive publish PPTX — always enabled.
 * Former `VITE_TEAMVER_PPTX_EXPORT_ENABLE` kill-switch is ignored (prd/stg/local).
 */
export function isTeamverPptxExportEnabled(_options?: { embed?: boolean }): boolean {
  return true;
}
