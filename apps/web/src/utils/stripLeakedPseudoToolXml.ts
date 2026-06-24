import { sanitizeLeakedAgentProse } from "../runtime/internalAgentMarkup";

/** Remove CLI-style pseudo-tool XML leaked into chat text (#313). */
export function stripLeakedPseudoToolXml(text: string): string {
  return sanitizeLeakedAgentProse(text);
}
