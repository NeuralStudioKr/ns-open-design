import { sanitizeAssistantProseForDisplay } from "../runtime/internalAgentMarkup";

/** Strip leaked pseudo-tool markup from streaming SSE chunks (preserves open `<artifact>`). */
export function stripLeakedPseudoToolXml(text: string): string {
  return sanitizeAssistantProseForDisplay(text, { streaming: true });
}
