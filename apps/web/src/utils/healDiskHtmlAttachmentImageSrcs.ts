import { rewriteAttachmentImageSrcs } from './rewriteAttachmentImageSrcs';

/**
 * Heal wrong model-emitted `<img src>` on an HTML file already written to disk
 * (e.g. agent Write tool short-circuit that skipped `persistArtifact`).
 *
 * Preview can still heal ephemerally; without this, reload/export keep the
 * broken basename and show alt-only images.
 */
export async function healDiskHtmlAttachmentImageSrcs(options: {
  html: string;
  projectFilePaths: readonly string[];
  preferredAttachmentPaths?: readonly string[];
}): Promise<{ html: string; changed: boolean }> {
  const projectPaths = Array.from(
    new Set([
      ...options.projectFilePaths.map((path) => String(path || '').trim()).filter(Boolean),
      ...(options.preferredAttachmentPaths ?? [])
        .map((path) => String(path || '').trim())
        .filter(Boolean),
    ]),
  );
  if (!options.html.trim() || projectPaths.length === 0) {
    return { html: options.html, changed: false };
  }
  const next = rewriteAttachmentImageSrcs(options.html, projectPaths, {
    preferredPaths: options.preferredAttachmentPaths,
  });
  return { html: next, changed: next !== options.html };
}
