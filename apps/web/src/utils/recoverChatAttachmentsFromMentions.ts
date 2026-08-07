import type { ChatAttachment, ChatMessage } from '../types';
import { stripUserVisibleUserMessageText } from '../comments';
import {
  isEphemeralDrawingScreenshotPath,
  isRenderableImagePath,
  projectFilePathBasename,
  projectFilePathsReferToSameFile,
} from './projectFilePaths';

const IMAGE_MENTION_PATH_RE =
  /(?:^|[\s([{"'])@([^\s@]+\.(?:png|jpe?g|gif|webp|avif|bmp|svg))\b/gi;

/** Extract `@image.webp` paths from visible user text (composer mention leftovers). */
export function extractImageMentionPathsFromUserText(content: string | null | undefined): string[] {
  const visible = stripUserVisibleUserMessageText(content);
  if (!visible.includes('@')) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  IMAGE_MENTION_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_MENTION_PATH_RE.exec(visible)) !== null) {
    const path = String(match[1] || '').trim().replace(/\\/g, '/');
    if (!path || seen.has(path) || isEphemeralDrawingScreenshotPath(path)) continue;
    if (!isRenderableImagePath(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function attachmentsAlreadyCoverPath(
  attachments: readonly ChatAttachment[],
  path: string,
): boolean {
  return attachments.some((attachment) => projectFilePathsReferToSameFile(attachment.path, path));
}

/**
 * After refresh, some older / partial upserts keep `@goldfish.webp` in content
 * but drop `attachments_json`. Rebuild image attachment chips from those
 * mentions so history does not degrade to plain `@filename` text only.
 */
export function recoverChatAttachmentsFromMentions(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message;
  const mentioned = extractImageMentionPathsFromUserText(message.content);
  if (mentioned.length === 0) return message;
  const existing = message.attachments ?? [];
  const recovered: ChatAttachment[] = [...existing];
  let order = recovered.reduce((max, item) => {
    const value = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : -1;
    return Math.max(max, value);
  }, -1) + 1;
  let changed = false;
  for (const path of mentioned) {
    if (attachmentsAlreadyCoverPath(recovered, path)) continue;
    recovered.push({
      path,
      name: projectFilePathBasename(path),
      kind: 'image',
      order,
    });
    order += 1;
    changed = true;
  }
  if (!changed) return message;
  return { ...message, attachments: recovered };
}
