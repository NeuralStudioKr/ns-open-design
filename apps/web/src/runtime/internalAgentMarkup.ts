/**
 * @deprecated Import from `@open-design/contracts` — kept for stable web import paths.
 */
export {
  LEAKED_AGENT_PROSE_TAG_NAMES,
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  stripTrailingOpenInternalMarkup,
  stripIncompleteTrailingMarkupToken,
  stripAssistantCodeFencesForDisplay,
  createStreamingAssistantProseGuard,
} from "@open-design/contracts";

import { sanitizeLeakedAgentProse } from "@open-design/contracts";

/**
 * Remove completed internal markup blocks and fake tool narration from prose.
 *
 * By default this ALSO strips closed `<artifact>` blocks — that matches the
 * old-loop-406 SSOT default and is what display paths want. Callers that
 * pre-process artifact blocks separately (e.g. transcript summarization,
 * which keeps unconfirmed-save bodies intact) must opt in to preservation
 * via `preserveClosedArtifact: true` — otherwise the SSOT strip would
 * silently discard those bodies here at the tail of the sanitizer chain,
 * leaving the next turn with no source to inspect or repair.
 */
export function stripInternalOpenDesignMarkup(
  input: string,
  options: { preserveClosedArtifact?: boolean } = {},
): string {
  return sanitizeLeakedAgentProse(input, options);
}
