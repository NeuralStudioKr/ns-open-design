import { htmlLooksLikeNavigableDeckPreview } from '@open-design/contracts';
import { buildSrcdoc } from '../runtime/srcdoc';
import { projectRawUrl } from '../providers/registry';
import { projectScopedPreviewUrl } from '../teamver/teamverProjectPreviewScope';
import { rewriteAttachmentImageSrcs } from './rewriteAttachmentImageSrcs';

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function looksLikeDeckHtml(html: string): boolean {
  try {
    return htmlLooksLikeNavigableDeckPreview(html);
  } catch {
    return false;
  }
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
  userBrief?: string | null;
}): string {
  const rawHtml = String(options.html ?? '');
  const fileName = (options.fileName || 'deck.html').trim() || 'deck.html';
  try {
    const healPaths = Array.from(
      new Set([
        ...options.projectFilePaths.map((path) => String(path || '').trim()).filter(Boolean),
        ...(options.preferredAttachmentPaths ?? [])
          .map((path) => String(path || '').trim())
          .filter(Boolean),
      ]),
    );
    let healed = rawHtml;
    try {
      healed = rewriteAttachmentImageSrcs(rawHtml, healPaths, {
        preferredPaths: options.preferredAttachmentPaths,
      });
    } catch (err) {
      console.error('[prepareMemoryOnlySlidePreviewSrcDoc] rewriteAttachmentImageSrcs failed', fileName, err);
      healed = rawHtml;
    }
    const baseHref = resolveMemoryPreviewBaseHref({
      teamverEmbedMode: options.teamverEmbedMode,
      embedPreviewPrefix: options.embedPreviewPrefix,
      projectId: options.projectId,
      fileName,
    });
    try {
      return buildSrcdoc(healed, {
        deck: looksLikeDeckHtml(healed),
        baseHref,
        selectionBridge: false,
        previewFocusGuard: true,
        userBrief: options.userBrief,
      });
    } catch (err) {
      console.error('[prepareMemoryOnlySlidePreviewSrcDoc] buildSrcdoc failed', fileName, err);
      return healed;
    }
  } catch (err) {
    console.error('[prepareMemoryOnlySlidePreviewSrcDoc] failed', fileName, err);
    return rawHtml;
  }
}
