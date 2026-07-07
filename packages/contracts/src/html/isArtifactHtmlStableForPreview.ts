import { hasArtifactPreviewBodyTextLeaks } from "./artifactPreviewTextLeaks.js";

/**
 * Heuristic gate for live HTML preview updates during agent streaming.
 * Partial documents often render leaked CSS/JS as visible body text until the
 * closing tags arrive — hold the iframe on the last stable snapshot instead.
 */
export function isArtifactHtmlStableForPreview(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (!lower.includes("</body>") || !lower.includes("</html>")) return false;
  if (hasArtifactPreviewBodyTextLeaks(trimmed)) return false;

  const styleOpens = (trimmed.match(/<style\b/gi) ?? []).length;
  const styleCloses = (trimmed.match(/<\/style>/gi) ?? []).length;
  if (styleOpens > styleCloses) return false;

  const scriptOpens = (trimmed.match(/<script\b/gi) ?? []).length;
  const scriptCloses = (trimmed.match(/<\/script>/gi) ?? []).length;
  if (scriptOpens > scriptCloses) return false;

  return true;
}
