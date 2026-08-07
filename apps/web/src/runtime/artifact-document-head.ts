import { repairArtifactDocumentHead } from '@open-design/contracts';

/**
 * Cheap gate: skip repairArtifactDocumentHead when the document already has
 * an intact head (charset + viewport) and no common corruption prefixes.
 * Repair remains idempotent — this only avoids the regex walk on hot paths.
 */
export function artifactDocumentHeadLooksIntact(html: string): boolean {
  if (!html || !/<head[\s>]/i.test(html) || !/<\/head>/i.test(html)) return false;
  if (!/<meta\s+charset/i.test(html)) return false;
  if (!/<meta\s+name=["']viewport["']/i.test(html)) return false;
  // Corrupted / leaked head prefixes that repair would rewrite.
  if (
    /<head[^>]*>\s*(?:viewport\s*=|device-width|-width|googleapis\.com|fonts\.gstatic|css2\?family=)/i
      .test(html)
  ) {
    return false;
  }
  return true;
}

/** Skip repairArtifactDocumentHead when the head already looks intact. */
export function repairArtifactDocumentHeadIfNeeded(html: string): string {
  return artifactDocumentHeadLooksIntact(html) ? html : repairArtifactDocumentHead(html);
}
