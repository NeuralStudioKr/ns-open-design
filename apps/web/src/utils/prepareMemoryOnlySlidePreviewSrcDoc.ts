import { buildSrcdoc } from '../runtime/srcdoc';
import { projectRawUrl } from '../providers/registry';
import { projectScopedPreviewUrl } from '../teamver/teamverProjectPreviewScope';
import { rewriteAttachmentImageSrcs } from './rewriteAttachmentImageSrcs';

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function looksLikeDeckHtml(html: string): boolean {
  return (
    /\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(html)
    || /<section[^>]*\bclass\s*=\s*['"]slide['"]/i.test(html)
  );
}

function resolveMemoryPreviewBaseHref(options: {
  teamverEmbedMode: boolean;
  embedPreviewPrefix: string | null;
  projectId: string;
  fileName: string;
}): string | undefined {
  const dir = baseDirFor(options.fileName);
  const rawUrl = projectRawUrl(options.projectId, dir);
  if (!options.teamverEmbedMode) return rawUrl;
  if (!options.embedPreviewPrefix) return undefined;
  return projectScopedPreviewUrl(options.embedPreviewPrefix, dir);
}

/**
 * Build a sandboxed srcDoc for FileWorkspace's memory-only preview path
 * (streaming / session recovery before deck.html is on disk).
 *
 * The previous bare `srcDoc={html}` path had no `<base href>` and no
 * attachment-src heal, so relative composer/Drive images resolved against
 * `about:srcdoc` and showed as alt-only broken images.
 */
export function prepareMemoryOnlySlidePreviewSrcDoc(options: {
  html: string;
  projectId: string;
  fileName?: string | null;
  projectFilePaths: readonly string[];
  preferredAttachmentPaths?: readonly string[];
  teamverEmbedMode: boolean;
  embedPreviewPrefix: string | null;
}): string {
  const fileName = (options.fileName || 'deck.html').trim() || 'deck.html';
  const healPaths = Array.from(
    new Set([
      ...options.projectFilePaths.map((path) => String(path || '').trim()).filter(Boolean),
      ...(options.preferredAttachmentPaths ?? [])
        .map((path) => String(path || '').trim())
        .filter(Boolean),
    ]),
  );
  const healed = rewriteAttachmentImageSrcs(options.html, healPaths, {
    preferredPaths: options.preferredAttachmentPaths,
  });
  const baseHref = resolveMemoryPreviewBaseHref({
    teamverEmbedMode: options.teamverEmbedMode,
    embedPreviewPrefix: options.embedPreviewPrefix,
    projectId: options.projectId,
    fileName,
  });
  return buildSrcdoc(healed, {
    deck: looksLikeDeckHtml(healed),
    baseHref,
    selectionBridge: false,
    previewFocusGuard: true,
  });
}
