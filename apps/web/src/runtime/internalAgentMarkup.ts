/**
 * @deprecated Import from `@open-design/contracts` — kept for stable web import paths.
 */
export {
  LEAKED_AGENT_PROSE_TAG_NAMES,
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  stripTrailingOpenInternalMarkup,
} from "@open-design/contracts";

import { sanitizeLeakedAgentProse } from "@open-design/contracts";

/** Remove completed internal markup blocks and fake tool narration from prose. */
export function stripInternalOpenDesignMarkup(input: string): string {
  return sanitizeLeakedAgentProse(input);
}
