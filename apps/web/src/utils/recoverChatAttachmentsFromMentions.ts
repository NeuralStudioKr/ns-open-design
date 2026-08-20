import type { ChatAttachment, ChatMessage } from '../types';
import { stripUserVisibleUserMessageText } from '../comments';
import {
  isEphemeralDrawingScreenshotPath,
  isRenderableImagePath,
  normalizeProjectFilePath,
  projectFilePathBasename,
  projectFilePathsReferToSameFile,
} from './projectFilePaths';

const IMAGE_MENTION_PATH_RE =
  /(?:^|[\s([{"'])@([^\s@]+\.(?:png|jpe?g|gif|webp|avif|bmp|svg))\b/gi;
const IMAGE_EMBED_SRC_RE =
  /src=["']([^"']+\.(?:png|jpe?g|gif|webp|avif|bmp|svg))["']/gi;
const ATTACHED_IMAGE_EMBED_BLOCK_RE =
  /\[Attached image embed\]([\s\S]*?)(?=\n\[|\n*<attached-preview-comments>|$)/i;

function pushUniqueImagePath(path: string, out: string[], seen: Set<string>): void {
  const normalized = normalizeProjectFilePath(path);
  if (!normalized || seen.has(normalized)) return;
  if (isEphemeralDrawingScreenshotPath(normalized)) return;
  if (!isRenderableImagePath(normalized)) return;
  seen.add(normalized);
  out.push(normalized);
}

/** Extract image paths from `@mentions` and durable `[Attached image embed]` blocks. */
export function extractImageMentionPathsFromUserText(content: string | null | undefined): string[] {
  const raw = String(content ?? '');
  const out: string[] = [];
  const seen = new Set<string>();

  // Prefer the durable embed contract block (stripped from visible chat text)
  // so refresh recovery still works when `@path` was never written into prose.
  const embedBlock = raw.match(ATTACHED_IMAGE_EMBED_BLOCK_RE)?.[1] ?? '';
  if (embedBlock) {
    IMAGE_EMBED_SRC_RE.lastIndex = 0;
    let srcMatch: RegExpExecArray | null;
    while ((srcMatch = IMAGE_EMBED_SRC_RE.exec(embedBlock)) !== null) {
      pushUniqueImagePath(srcMatch[1] ?? '', out, seen);
    }
  }

  const visible = stripUserVisibleUserMessageText(raw);
  if (visible.includes('@')) {
    IMAGE_MENTION_PATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMAGE_MENTION_PATH_RE.exec(visible)) !== null) {
      pushUniqueImagePath(match[1] ?? '', out, seen);
    }
  }
  return out;
}

function attachmentsAlreadyCoverPath(
  attachments: readonly ChatAttachment[],
  path: string,
): boolean {
  return attachments.some((attachment) => projectFilePathsReferToSameFile(attachment.path, path));
}

function nextAttachmentOrder(attachments: readonly ChatAttachment[]): number {
  return attachments.reduce((max, item) => {
    const value = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : -1;
    return Math.max(max, value);
  }, -1) + 1;
}

/**
 * Merge image paths discovered in user text / embed contracts into an
 * attachment list. Used by history recovery, composer send, and auto-continue.
 */
export function mergeImageMentionAttachments(
  attachments: readonly ChatAttachment[] | null | undefined,
  content: string | null | undefined,
): ChatAttachment[] {
  const existing = [...(attachments ?? [])];
  const mentioned = extractImageMentionPathsFromUserText(content);
  if (mentioned.length === 0) return existing;
  let order = nextAttachmentOrder(existing);
  let changed = false;
  for (const path of mentioned) {
    if (attachmentsAlreadyCoverPath(existing, path)) continue;
    existing.push({
      path,
      name: projectFilePathBasename(path),
      kind: 'image',
      order,
    });
    order += 1;
    changed = true;
  }
  return changed ? existing : [...(attachments ?? [])];
}

/**
 * Persist a durable `[Attached image embed]` recovery block when comment
 * sanitizers / visible-text helpers would otherwise strip it. History chips
 * and auto-continue can still rebuild attachments from the `<img src>` lines
 * if `attachments_json` is later dropped by a partial upsert.
 */
export function ensureDurableImageEmbedContract(
  content: string | null | undefined,
  attachments: readonly ChatAttachment[] | null | undefined,
): string {
  const text = String(content ?? '');
  const imagePaths = (attachments ?? [])
    .map((attachment) => normalizeProjectFilePath(attachment.path))
    .filter((path) => path && isRenderableImagePath(path) && !isEphemeralDrawingScreenshotPath(path));
  if (imagePaths.length === 0) return text;
  if (ATTACHED_IMAGE_EMBED_BLOCK_RE.test(text)) return text;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const path of imagePaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    unique.push(path);
  }
  const block = [
    '[Attached image embed]',
    ...unique.map((path) => `- <img src="${path}" alt="">`),
  ].join('\n');
  const trimmed = text.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

/**
 * After refresh, some older / partial upserts keep `@goldfish.webp` in content
 * (or only inside `[Attached image embed]`) but drop `attachments_json`.
 * Rebuild image attachment chips so history / vision / auto-continue keep
 * working.
 */
export function recoverChatAttachmentsFromMentions(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message;
  const existing = message.attachments ?? [];
  const mentioned = extractImageMentionPathsFromUserText(message.content);
  if (mentioned.length === 0) return message;
  if (mentioned.every((path) => attachmentsAlreadyCoverPath(existing, path))) return message;
  return {
    ...message,
    attachments: mergeImageMentionAttachments(existing, message.content),
  };
}
