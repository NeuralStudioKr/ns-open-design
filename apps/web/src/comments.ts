import type {
  ChatAttachment,
  ChatCommentAttachment,
  ChatCommentSelectionKind,
  ChatMessage,
  ProjectFile,
  PreviewAnnotationStyle,
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewComment,
  PreviewCommentSelectionKind,
  PreviewCommentTarget,
  PreviewVisualMarkKind,
} from './types';
import { stripUserVisibleQuestionFormProtocolText } from './artifacts/question-form';
import {
  looksLikeAlignmentCommentRequest,
  looksLikeMarkupLayoutCommentRequest,
  looksLikeRemovalCommentRequest,
  looksLikeStyleOnlyCommentRequest,
} from './edit-mode/comment-edit-intent';
import { isSyntheticVisualMarkTargetId } from './edit-mode/source-patches';
import { isTeamverEmbedMode } from './teamver/designApiBase';
import { isRenderableImagePath, projectFilePathBasename } from './utils/projectFilePaths';

export interface PreviewCommentSnapshot {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: { x: number; y: number; width: number; height: number };
  hoverPoint?: { x: number; y: number };
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  slideIndex?: number;
}

export interface CommentOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisualAnnotationTarget {
  filePath: string;
  elementId?: string;
  selector?: string;
  label?: string;
  text?: string;
  position?: { x: number; y: number; width: number; height: number };
  htmlHint?: string;
  style?: PreviewAnnotationStyle;
  slideIndex?: number;
}

export interface VisualAnnotationAttachmentInput {
  order: number;
  idSeed?: string;
  screenshotPath: string;
  markKind: PreviewVisualMarkKind;
  note: string;
  bounds: { x: number; y: number; width: number; height: number };
  target?: VisualAnnotationTarget | null;
  slideIndex?: number;
}

export function isInternalCommentTargetName(value: string | undefined | null): boolean {
  const trimmed = String(value ?? '').trim();
  return /^path-\d+(?:-\d+)*$/.test(trimmed);
}

export function commentTargetDisplayName(
  target: {
    elementId?: string | null;
    label?: string | null;
    selectionKind?: ChatCommentSelectionKind | PreviewCommentSelectionKind | null;
  },
  fallback = 'Annotation',
): string {
  const embed = isTeamverEmbedMode();
  if (target.selectionKind === 'visual') {
    return embed ? '시각 마크' : 'Visual mark';
  }
  const label = String(target.label ?? '').trim();
  if (label && !isInternalCommentTargetName(label)) return label;
  const elementId = String(target.elementId ?? '').trim();
  if (elementId && !isInternalCommentTargetName(elementId)) return elementId;
  return embed ? '주석' : fallback;
}

export function targetFromSnapshot(snapshot: PreviewCommentSnapshot): PreviewCommentTarget {
  const podMembers = normalizeMembers(snapshot.podMembers);
  return {
    filePath: snapshot.filePath,
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: trimContextText(snapshot.text),
    position: normalizePosition(snapshot.position),
    htmlHint: trimHtmlHint(snapshot.htmlHint),
    style: normalizeStyle(snapshot.style),
    selectionKind: snapshot.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      snapshot.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : Number.isFinite(snapshot.memberCount)
              ? Math.round(snapshot.memberCount as number)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
    ...(snapshot.slideIndex === undefined ? {} : { slideIndex: snapshot.slideIndex }),
  };
}

export function isValidCommentOverlayPosition(
  position: { x: number; y: number; width: number; height: number } | undefined | null,
): boolean {
  if (!position) return false;
  const normalized = normalizePosition(position);
  return (
    Number.isFinite(normalized.x)
    && Number.isFinite(normalized.y)
    && Number.isFinite(normalized.width)
    && Number.isFinite(normalized.height)
    && normalized.width > 0
    && normalized.height > 0
  );
}

export function commentVisibleOnDeckSlide(
  comment: Pick<PreviewComment, 'slideIndex'>,
  activeSlideIndex: number | null | undefined,
): boolean {
  if (activeSlideIndex == null) return true;
  if (typeof comment.slideIndex !== 'number') return true;
  return comment.slideIndex === activeSlideIndex;
}

/**
 * Project-relative HTML path a comment edit should update in place.
 * Nested decks keep their directory (`slides/deck.html`); basenames alone
 * are returned only for root HTML. Non-HTML paths (e.g. screenshot PNGs)
 * are ignored so callers fall back to the open/canonical deck.
 */
export function resolveCommentEditPersistTargetFileName(
  commentAttachments: readonly ChatCommentAttachment[] | null | undefined,
): string | null {
  if (!commentAttachments?.length) return null;
  for (const attachment of commentAttachments) {
    const filePath = attachment.filePath?.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!filePath) continue;
    // Screenshot-only visual marks store uploads/*.png as filePath. Never
    // treat image/binary uploads as the in-place deck persist target.
    if (!/\.html?$/i.test(filePath)) continue;
    return filePath;
  }
  return null;
}

// When a queued chat send starts processing, the deck preview should flip to
// the slide its marked element lives on so the user watches the edit land in
// context instead of staring at slide 1. The mark's `slideIndex` is captured
// at queue time and carried on each comment attachment. Return the first
// attachment that names a deck file and a concrete slide; null means there is
// nothing slide-scoped to navigate to (plain prompt, free pin, missing index).
export function queuedSlideNavTarget(
  commentAttachments: readonly ChatCommentAttachment[] | null | undefined,
  options?: { fallbackDeckFilePath?: string | null },
): { filePath: string; slideIndex: number } | null {
  if (!commentAttachments) return null;
  let slideOnly: number | null = null;
  for (const attachment of commentAttachments) {
    const filePath = attachment.filePath?.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const slideIndex = attachment.slideIndex;
    if (
      typeof slideIndex !== 'number' ||
      !Number.isFinite(slideIndex) ||
      slideIndex < 0
    ) {
      continue;
    }
    const floor = Math.floor(slideIndex);
    // Screenshot-only visuals store uploads/*.png as filePath — never treat
    // that as a deck tab name. Keep the slide index for fallback below.
    if (filePath && /\.html?$/i.test(filePath)) {
      return { filePath, slideIndex: floor };
    }
    if (slideOnly == null) slideOnly = floor;
  }
  if (slideOnly == null) return null;
  const fallback = options?.fallbackDeckFilePath?.trim().replace(/\\/g, '/').replace(/^\.\//, '') || '';
  if (fallback && /\.html?$/i.test(fallback)) {
    return { filePath: fallback, slideIndex: slideOnly };
  }
  return null;
}

export function commentSnapshotOverlayEqual(
  a: PreviewCommentSnapshot,
  b: PreviewCommentSnapshot,
): boolean {
  const positionA = normalizePosition(a.position);
  const positionB = normalizePosition(b.position);
  return (
    a.elementId === b.elementId
    && a.filePath === b.filePath
    && positionA.x === positionB.x
    && positionA.y === positionB.y
    && positionA.width === positionB.width
    && positionA.height === positionB.height
    && (a.slideIndex ?? -1) === (b.slideIndex ?? -1)
  );
}

export function commentSnapshotEqual(
  a: PreviewCommentSnapshot,
  b: PreviewCommentSnapshot,
): boolean {
  if (!commentSnapshotOverlayEqual(a, b)) return false;
  return (
    a.selector === b.selector
    && a.label === b.label
    && trimContextText(a.text) === trimContextText(b.text)
    && trimHtmlHint(a.htmlHint) === trimHtmlHint(b.htmlHint)
    && normalizeSelectionKind(a.selectionKind) === normalizeSelectionKind(b.selectionKind)
    && normalizeMemberCount(a.memberCount) === normalizeMemberCount(b.memberCount)
    && JSON.stringify(normalizeStyle(a.style) ?? null) === JSON.stringify(normalizeStyle(b.style) ?? null)
    && JSON.stringify(normalizeMembers(a.podMembers)) === JSON.stringify(normalizeMembers(b.podMembers))
    && normalizeHoverPoint(a.hoverPoint).x === normalizeHoverPoint(b.hoverPoint).x
    && normalizeHoverPoint(a.hoverPoint).y === normalizeHoverPoint(b.hoverPoint).y
  );
}

export function liveCommentTargetMapsEqual(
  current: Map<string, PreviewCommentSnapshot>,
  next: Map<string, PreviewCommentSnapshot>,
): boolean {
  if (current.size !== next.size) return false;
  for (const [elementId, snapshot] of current) {
    const candidate = next.get(elementId);
    if (!candidate || !commentSnapshotEqual(snapshot, candidate)) return false;
  }
  return true;
}

export function overlayBoundsFromSnapshot(
  snapshot: PreviewCommentSnapshot,
  scale: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): CommentOverlayBounds {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const position = normalizePosition(snapshot.position);
  return {
    left: offset.x + position.x * safeScale,
    top: offset.y + position.y * safeScale,
    width: Math.max(1, position.width * safeScale),
    height: Math.max(1, position.height * safeScale),
  };
}

export function liveSnapshotForComment(
  comment: PreviewComment,
  snapshots: Map<string, PreviewCommentSnapshot>,
): PreviewCommentSnapshot | null {
  const snapshot = snapshots.get(comment.elementId);
  if (snapshot && snapshot.filePath === comment.filePath && isValidCommentOverlayPosition(snapshot.position)) {
    return snapshot;
  }
  if (!comment.elementId.startsWith('pin-')) return null;
  if (!isValidCommentOverlayPosition(comment.position)) return null;
  return {
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    text: trimContextText(comment.text),
    position: normalizePosition(comment.position),
    htmlHint: trimHtmlHint(comment.htmlHint),
    style: normalizeStyle(comment.style),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount: comment.memberCount,
    podMembers: normalizeMembers(comment.podMembers),
    slideIndex: comment.slideIndex,
  };
}

export function commentToAttachment(
  comment: PreviewComment,
  order: number,
): ChatCommentAttachment {
  const podMembers = normalizeMembers(comment.podMembers);
  const imageAttachments = mergePreviewCommentAttachments(undefined, comment.attachments);
  return {
    id: comment.id,
    order,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    comment: comment.note.trim() || imageOnlyCommentFallback(imageAttachments.length),
    currentText: trimContextText(comment.text),
    pagePosition: normalizePosition(comment.position),
    htmlHint: trimHtmlHint(comment.htmlHint),
    style: normalizeStyle(comment.style),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      comment.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : typeof comment.memberCount === 'number'
              ? Math.round(comment.memberCount)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
    ...(typeof comment.slideIndex === 'number' ? { slideIndex: comment.slideIndex } : {}),
    imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
    source: 'saved-comment',
  };
}

export function commentsToAttachments(comments: PreviewComment[]): ChatCommentAttachment[] {
  return comments.map((comment, index) => commentToAttachment(comment, index + 1));
}

export function buildBoardCommentAttachments(input: {
  target: PreviewCommentTarget;
  notes: string[];
  includeImageOnly?: boolean;
  imageAttachmentCount?: number;
}): ChatCommentAttachment[] {
  const podMembers = normalizeMembers(input.target.podMembers);
  const selectionKind = input.target.selectionKind === 'pod' ? 'pod' : 'element';
  const memberCount =
    selectionKind === 'pod'
      ? (podMembers.length > 0
          ? podMembers.length
          : typeof input.target.memberCount === 'number'
            ? Math.round(input.target.memberCount)
            : 0)
      : undefined;
  const notes = input.notes
    .map((note) => note.trim())
    .filter(Boolean);
  const comments = notes.length > 0
    ? notes
    : input.includeImageOnly
      ? [imageOnlyCommentFallback(input.imageAttachmentCount ?? 0)]
      : [];
  return comments
    .filter(Boolean)
    .map((note, index) => ({
      id: `${input.target.elementId}-board-${index + 1}`,
      order: index + 1,
      filePath: input.target.filePath,
      elementId: input.target.elementId,
      selector: input.target.selector,
      label: input.target.label,
      comment: note,
      currentText: trimContextText(input.target.text),
      pagePosition: normalizePosition(input.target.position),
      htmlHint: trimHtmlHint(input.target.htmlHint),
      style: normalizeStyle(input.target.style),
      selectionKind,
      memberCount,
      podMembers: podMembers.length > 0 ? podMembers : undefined,
      ...(typeof input.target.slideIndex === 'number' ? { slideIndex: input.target.slideIndex } : {}),
      source: 'board-batch',
    }));
}

export function buildVisualAnnotationAttachment(input: VisualAnnotationAttachmentInput): ChatCommentAttachment {
  const target = input.target ?? null;
  const intent = visualAnnotationIntent(input.markKind, input.note);
  const visualId = sanitizeVisualAttachmentId(input.idSeed || input.screenshotPath || String(input.order));
  const elementId = target?.elementId?.trim() || `visual-mark-${visualId}`;
  const label = target?.label?.trim() || 'Marked screenshot region';
  const comment = input.note.trim() || intent;
  const slideIndex =
    typeof input.slideIndex === 'number' && Number.isFinite(input.slideIndex) && input.slideIndex >= 0
      ? Math.floor(input.slideIndex)
      : typeof target?.slideIndex === 'number' && Number.isFinite(target.slideIndex) && target.slideIndex >= 0
        ? Math.floor(target.slideIndex)
        : undefined;
  return {
    id: `${elementId}-visual-${visualId}`,
    order: input.order,
    filePath: (() => {
      const targetPath = target?.filePath?.trim();
      if (targetPath && !isRenderableImagePath(targetPath)) return targetPath;
      return input.screenshotPath;
    })(),
    elementId,
    selector: target?.selector?.trim() || '',
    label,
    comment,
    currentText: trimContextText(target?.text || ''),
    pagePosition: normalizePosition(target?.position ?? input.bounds),
    htmlHint: trimHtmlHint(target?.htmlHint || ''),
    style: normalizeStyle(target?.style),
    selectionKind: 'visual',
    screenshotPath: input.screenshotPath,
    markKind: input.markKind,
    intent,
    ...(slideIndex !== undefined ? { slideIndex } : {}),
    source: 'board-batch',
  };
}

function sanitizeVisualAttachmentId(value: string): string {
  const id = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'mark';
}

export const COMMENT_ONLY_USER_PLACEHOLDER = '(No extra typed instruction.)';

export const SLIDE_COMMENT_EDIT_PATCH_INSTRUCTION_MARKER = '[Comment-edit patch contract]';

const COMMENT_EDIT_PATCH_DIRECTIVE_RE =
  /\n*\[Comment-edit patch contract\][\s\S]*$/i;
const EXISTING_DECK_EDIT_DIRECTIVE_RE =
  /\n*\[Existing deck edit\][\s\S]*$/i;
const TEMPLATE_CLONE_CONTENT_FILL_DIRECTIVE_RE =
  /\n*\[Template clone (?:content fill(?: turn)?|prompt fill|slot-fill JSON repair)\][\s\S]*$/i;
const CANVAS_CREATE_SCAFFOLD_DIRECTIVE_RE =
  /\n*\[(?:Deliverable instruction|Selected slide template(?: priority)?|Source brief|Quick settings)\][\s\S]*$/i;
const DESIGN_TOOLBOX_INSTRUCTION_RE =
  /\n*\[Design toolbox instruction\][\s\S]*$/i;
const ATTACHED_IMAGE_EMBED_DIRECTIVE_RE =
  /\n*\[Attached image embed\][\s\S]*$/i;
const ACTIVE_WORKSPACE_CONTEXT_RE =
  /\n*<active-workspace-context>[\s\S]*?(?:<\/active-workspace-context>\s*|$)/gi;
const ATTACHED_PROJECT_FILES_RE =
  /\n*<attached-project-files>[\s\S]*?(?:<\/attached-project-files>\s*|$)/gi;
const WEB_FETCH_CONTEXT_RE =
  /\n*<web-fetch-context>[\s\S]*?(?:<\/web-fetch-context>\s*|$)/gi;
const ATTACHED_PREVIEW_COMMENTS_RE =
  /\n*<attached-preview-comments>[\s\S]*?<\/attached-preview-comments>\s*/gi;
const ATTACHED_PREVIEW_COMMENTS_BLOCK_RE =
  /<attached-preview-comments>([\s\S]*?)<\/attached-preview-comments>/i;

function parseAttachedPreviewCommentField(
  block: string,
  key: string,
): string | undefined {
  const match = block.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function parseAttachedPreviewCommentPosition(
  raw: string | undefined,
): PreviewComment['position'] {
  const value = String(raw ?? '').trim();
  const match = value.match(/^x(-?\d+)\s+y(-?\d+)\s+(-?\d+)x(-?\d+)$/i);
  if (!match) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Number(match[1]) || 0,
    y: Number(match[2]) || 0,
    width: Number(match[3]) || 0,
    height: Number(match[4]) || 0,
  };
}

/** Rebuild pod members from `member.N: id | label | selector` history lines. */
function parseAttachedPreviewPodMembers(section: string): PreviewCommentMember[] {
  const byIndex = new Map<number, PreviewCommentMember>();
  const re = /^member\.(\d+):\s*([^|]+)\|\s*([^|]*)\|\s*(.*)$/gm;
  for (const match of section.matchAll(re)) {
    const index = Number(match[1]);
    if (!Number.isFinite(index) || index < 1) continue;
    const elementId = String(match[2] || '').trim();
    const label = stripAttachedPreviewPlaceholder(match[3]);
    const selector = stripAttachedPreviewPlaceholder(match[4]);
    if (!elementId || !selector) continue;
    const style = parseAttachedPreviewComputedStyle(
      parseAttachedPreviewCommentField(section, `member.${index}.computedStyle`),
    );
    const text = stripAttachedPreviewPlaceholder(
      parseAttachedPreviewCommentField(section, `member.${index}.text`),
    );
    const htmlHint = stripAttachedPreviewPlaceholder(
      parseAttachedPreviewCommentField(section, `member.${index}.htmlHint`),
    );
    const position = parseAttachedPreviewCommentPosition(
      parseAttachedPreviewCommentField(section, `member.${index}.position`),
    );
    byIndex.set(index, {
      elementId,
      selector,
      label,
      text: trimContextText(text),
      position,
      htmlHint: trimHtmlHint(htmlHint),
      ...(style ? { style } : {}),
    });
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, member]) => member);
}

/** Inverse of `formatAnnotationStyle` for history round-trip. */
function parseAttachedPreviewComputedStyle(
  raw: string | null | undefined,
): PreviewAnnotationStyle | undefined {
  const text = stripAttachedPreviewPlaceholder(raw);
  if (!text) return undefined;
  const style: PreviewAnnotationStyle = {};
  for (const part of text.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).replace(/\s+/g, ' ').trim();
    if (!(ANNOTATION_STYLE_KEYS as readonly string[]).includes(key) || !value) continue;
    style[key as keyof PreviewAnnotationStyle] = value.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/** Rebuild `image.N: path | name` lines written by renderCommentAttachmentContext. */
function parseAttachedPreviewImageAttachments(section: string): PreviewCommentAttachment[] {
  const byIndex = new Map<number, PreviewCommentAttachment>();
  // Accept `path | name` (preferred) and path-only legacy/hardened lines.
  const re = /^image\.(\d+):\s*(.+)$/gm;
  for (const match of section.matchAll(re)) {
    const index = Number(match[1]);
    if (!Number.isFinite(index) || index < 1) continue;
    const raw = String(match[2] || '').trim();
    if (!raw) continue;
    const pipe = raw.indexOf('|');
    const path = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim();
    if (!path) continue;
    const nameToken = pipe >= 0 ? raw.slice(pipe + 1).trim() : '';
    const basename = path.split('/').pop() || path;
    // Prefer on-disk basename over a drifted display name when they differ.
    const name = nameToken && nameToken === basename ? nameToken : basename;
    byIndex.set(index, { path, name });
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

/**
 * Rebuild `commentAttachments` from a persisted `<attached-preview-comments>`
 * block when the structured column was dropped by a stale server merge.
 */
export function parseCommentAttachmentsFromMessageContent(
  content: string | null | undefined,
): ChatCommentAttachment[] {
  const source = String(content ?? '');
  const blockMatch = source.match(ATTACHED_PREVIEW_COMMENTS_BLOCK_RE);
  if (!blockMatch?.[1]) return [];
  const body = blockMatch[1];
  const sections = body.split(/\n(?=\d+\.\s)/).map((section) => section.trim()).filter(Boolean);
  const out: ChatCommentAttachment[] = [];
  for (const section of sections) {
    const header = section.match(/^(\d+)\.\s+(.+)$/m);
    if (!header) continue;
    const order = Number(header[1]);
    const elementId = header[2]?.trim() ?? '';
    if (!elementId || !Number.isFinite(order)) continue;
    const targetKind = parseAttachedPreviewCommentField(section, 'targetKind');
    const selectionKind =
      targetKind === 'visual' ? 'visual' : targetKind === 'pod' ? 'pod' : 'element';
    const slideIndexRaw = parseAttachedPreviewCommentField(section, 'slideIndex');
    const slideIndex = slideIndexRaw != null ? Number(slideIndexRaw) : undefined;
    const attachment: ChatCommentAttachment = {
      id: `${elementId}-history-${order}`,
      order,
      filePath: parseAttachedPreviewCommentField(section, 'file') ?? '',
      elementId,
      selector: stripAttachedPreviewPlaceholder(
        parseAttachedPreviewCommentField(section, 'selector'),
      ),
      label: stripAttachedPreviewPlaceholder(
        parseAttachedPreviewCommentField(section, 'label'),
      ),
      comment: parseAttachedPreviewCommentField(section, 'comment') ?? '',
      currentText: stripAttachedPreviewPlaceholder(
        parseAttachedPreviewCommentField(section, 'currentText'),
      ),
      pagePosition: parseAttachedPreviewCommentPosition(
        parseAttachedPreviewCommentField(section, 'position'),
      ),
      htmlHint: stripAttachedPreviewPlaceholder(
        parseAttachedPreviewCommentField(section, 'htmlHint'),
      ),
      style: parseAttachedPreviewComputedStyle(
        parseAttachedPreviewCommentField(section, 'computedStyle'),
      ),
      selectionKind,
      ...(Number.isFinite(slideIndex) ? { slideIndex } : {}),
      ...(selectionKind === 'visual'
        ? {
            screenshotPath: stripAttachedPreviewPlaceholder(
              parseAttachedPreviewCommentField(section, 'screenshot'),
            ) || undefined,
            markKind: parseAttachedPreviewCommentField(section, 'markKind') as PreviewVisualMarkKind | undefined,
            intent: stripAttachedPreviewPlaceholder(
              parseAttachedPreviewCommentField(section, 'intent'),
            ) || undefined,
          }
        : {}),
      ...(selectionKind === 'pod'
        ? (() => {
            const podMembers = parseAttachedPreviewPodMembers(section);
            const memberCountRaw = parseAttachedPreviewCommentField(section, 'memberCount');
            const memberCount = memberCountRaw != null && Number.isFinite(Number(memberCountRaw))
              ? Math.max(0, Math.floor(Number(memberCountRaw)))
              : podMembers.length;
            return {
              ...(podMembers.length > 0 ? { podMembers } : {}),
              ...(memberCount > 0 ? { memberCount } : {}),
            };
          })()
        : {}),
      ...(() => {
        const imageAttachments = parseAttachedPreviewImageAttachments(section);
        return imageAttachments.length > 0 ? { imageAttachments } : {};
      })(),
    };
    if (hasUsableCommentLocationData(attachment)) out.push(attachment);
  }
  return out;
}

/**
 * Legacy board-batch rows may promote the user's note into the visible
 * prompt and blank `attachment.comment` with `commentContext: 'query'`.
 * Downstream recovery (auto-continue, chip render, scope blocks) must
 * hydrate the note back from the visible user text when the structured
 * field was cleared.
 */
export function hydrateQueryContextCommentAttachments(
  attachments: readonly ChatCommentAttachment[],
  instructionText?: string | null,
): ChatCommentAttachment[] {
  const instruction = stripUserVisibleUserMessageText(instructionText ?? '').trim();
  if (!instruction) return [...attachments];
  return attachments.map((attachment) => {
    if (String(attachment.comment ?? '').trim()) return attachment;
    if (attachment.commentContext !== 'query') return attachment;
    return { ...attachment, comment: instruction };
  });
}

export function visibleCommentEditInstruction(content: string | null | undefined): string {
  return stripUserVisibleUserMessageText(content ?? '').trim();
}

/**
 * Restore `commentAttachments` on a user turn from the durable
 * `<attached-preview-comments>` block when the structured column was dropped.
 */
export function reconcileUserCommentAttachments(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message;
  const commentAttachments =
    (message.commentAttachments?.length ?? 0) > 0
      ? message.commentAttachments!
      : parseCommentAttachmentsFromMessageContent(message.content);
  if (commentAttachments.length === 0) return message;
  const hydrated = hydrateQueryContextCommentAttachments(
    commentAttachments,
    visibleCommentEditInstruction(message.content),
  );
  const unchanged =
    (message.commentAttachments?.length ?? 0) === hydrated.length
    && hydrated.every((item, index) => {
      const prior = message.commentAttachments?.[index];
      return prior?.comment === item.comment && prior?.elementId === item.elementId;
    });
  if (unchanged && (message.commentAttachments?.length ?? 0) > 0) return message;
  return { ...message, commentAttachments: hydrated };
}

/** Strip model-only suffixes from user messages before rendering in chat UI. */
export function stripUserVisibleUserMessageText(content: string | null | undefined): string {
  let text = String(content ?? '');
  text = text.replace(ATTACHED_PREVIEW_COMMENTS_RE, '');
  text = text.replace(COMMENT_EDIT_PATCH_DIRECTIVE_RE, '');
  // Existing-deck marker is appended after image-embed; strip it first.
  text = text.replace(EXISTING_DECK_EDIT_DIRECTIVE_RE, '');
  // Post-Clone AI fill contract (model-only) — leave the user-facing request.
  text = text.replace(TEMPLATE_CLONE_CONTENT_FILL_DIRECTIVE_RE, '');
  // Home/Canvas create run dump — never show [Deliverable instruction] etc.
  text = text.replace(CANVAS_CREATE_SCAFFOLD_DIRECTIVE_RE, '');
  text = text.replace(DESIGN_TOOLBOX_INSTRUCTION_RE, '');
  text = text.replace(ATTACHED_IMAGE_EMBED_DIRECTIVE_RE, '');
  text = text.replace(ACTIVE_WORKSPACE_CONTEXT_RE, '');
  text = text.replace(ATTACHED_PROJECT_FILES_RE, '');
  text = text.replace(WEB_FETCH_CONTEXT_RE, '');
  return stripUserVisibleQuestionFormProtocolText(text);
}

export function messageContentWithCommentAttachments(
  content: string,
  commentAttachments: ChatCommentAttachment[],
): string {
  const scopedCommentAttachments = commentAttachments.filter(hasUsableCommentLocationData);
  if (scopedCommentAttachments.length === 0) return content;
  const visibleContent = content.trim() || COMMENT_ONLY_USER_PLACEHOLDER;
  const hydrated = hydrateQueryContextCommentAttachments(
    scopedCommentAttachments,
    visibleCommentEditInstruction(content),
  );
  return `${visibleContent}${renderCommentAttachmentContext(hydrated, { includeQueryComments: true })}`;
}

export function hasUsableCommentLocationData(item: ChatCommentAttachment): boolean {
  const selectionKind = item.selectionKind === 'visual' ? 'visual' : item.selectionKind === 'pod' ? 'pod' : 'element';
  if (selectionKind === 'visual') {
    return Boolean(
      String(item.screenshotPath || '').trim()
      || String(item.selector || '').trim()
      || String(item.elementId || '').trim(),
    );
  }
  if (selectionKind === 'pod') {
    return (item.podMembers ?? []).some((member) =>
      Boolean(String(member.elementId || '').trim() || String(member.selector || '').trim()),
    ) || Boolean(String(item.elementId || '').trim() || String(item.selector || '').trim());
  }
  return Boolean(
    String(item.elementId || '').trim()
    || String(item.selector || '').trim()
    || String(item.htmlHint || '').trim()
    || String(item.currentText || '').trim(),
  );
}

export function filterUsableCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): ChatCommentAttachment[] {
  return commentAttachments.filter(hasUsableCommentLocationData);
}

/** Collapse duplicate visual marks (same screenshot basename) and duplicate ids. */
export function dedupeCommentAttachments(
  attachments: readonly ChatCommentAttachment[],
): ChatCommentAttachment[] {
  const sorted = [...attachments].sort((left, right) => {
    const leftOrder = typeof left.order === 'number' ? left.order : 0;
    const rightOrder = typeof right.order === 'number' ? right.order : 0;
    return leftOrder - rightOrder;
  });
  const out: ChatCommentAttachment[] = [];
  const seenVisualBasenames = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of sorted) {
    if (isVisualCommentAttachment(item)) {
      const path = String(item.screenshotPath || item.filePath || '').trim();
      const key = path ? projectFilePathBasename(path).toLowerCase() : item.id;
      if (!key || seenVisualBasenames.has(key)) continue;
      seenVisualBasenames.add(key);
      out.push(item);
      continue;
    }
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    out.push(item);
  }
  return out;
}

export interface ChatAttachmentsFromPreviewCommentFilesOptions {
  /**
   * Skip attaching HTML deck files as project-file context.
   *
   * Motivation: on Teamver slide-only comment edits the current deck HTML is
   * already the last-assistant artifact in conversation history, so re-inlining
   * it via `<attached-project-files>` (up to 24KB per file / 64KB total) is pure
   * duplication that pushes TTFT out without giving the model any new info.
   * The `<attached-preview-comments>` block still carries `currentText`,
   * `htmlHint`, `selector`, and pod-member context for the target element.
   */
  skipDeckHtml?: boolean;
}

export function chatAttachmentsFromPreviewCommentFiles(
  commentAttachments: ChatCommentAttachment[],
  projectFiles: ProjectFile[],
  options: ChatAttachmentsFromPreviewCommentFilesOptions = {},
): ChatAttachment[] {
  if (commentAttachments.length === 0 || projectFiles.length === 0) return [];
  const byPath = new Map<string, ProjectFile>();
  const byName = new Map<string, ProjectFile>();
  for (const file of projectFiles) {
    const path = (file.path ?? file.name).trim();
    const name = file.name.trim();
    if (path) byPath.set(path, file);
    if (name) byName.set(name, file);
  }

  const out: ChatAttachment[] = [];
  const seen = new Set<string>();
  for (const comment of commentAttachments) {
    const filePath = String(comment.filePath || '').trim();
    if (!filePath || seen.has(filePath)) continue;
    const file =
      byPath.get(filePath) ??
      byName.get(filePath) ??
      byName.get(filePath.split('/').pop() ?? filePath);
    if (!file || file.type === 'dir') continue;
    const path = file.path ?? file.name;
    if (seen.has(path)) continue;
    if (!canAttachCommentSourceFile(path)) continue;
    if (options.skipDeckHtml && isDeckHtmlFile(file, path)) continue;
    seen.add(filePath);
    seen.add(path);
    out.push({
      path,
      name: file.name,
      kind: 'file',
      size: file.size,
    });
  }
  return out;
}

function isDeckHtmlFile(file: ProjectFile, path: string): boolean {
  if (file.kind === 'html') return true;
  const lower = path.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

export function historyWithCommentAttachmentContext(
  history: ChatMessage[],
): ChatMessage[] {
  return history.map((message) => {
    const commentAttachments = message.commentAttachments ?? [];
    // Enrich every comment-bearing user turn for API providers. Persisted
    // messages store prompt text only; prior comment-only turns often keep
    // content "" and would otherwise hit Anthropic's non-empty user rule.
    // Skip when the scope block is already present (idempotent if re-run).
    if (
      message.role !== 'user'
      || commentAttachments.length === 0
      || message.content.includes('<attached-preview-comments>')
    ) {
      return message;
    }
    return {
      ...message,
      content: messageContentWithCommentAttachments(message.content, commentAttachments),
    };
  });
}

export function mergeAttachedComments(
  current: PreviewComment[],
  next: PreviewComment,
): PreviewComment[] {
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  byId.set(next.id, next);
  return Array.from(byId.values());
}

export function removeAttachedComment(
  current: PreviewComment[],
  commentId: string,
): PreviewComment[] {
  return current.filter((comment) => comment.id !== commentId);
}

export function mergePreviewCommentAttachments(
  existing: PreviewCommentAttachment[] | undefined,
  incoming: PreviewCommentAttachment[] | undefined,
): PreviewCommentAttachment[] {
  const merged: PreviewCommentAttachment[] = [];
  const seen = new Set<string>();
  for (const item of [...(existing ?? []), ...(incoming ?? [])]) {
    const path = String(item.path || '').trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = String(item.name || '').trim() || path.split('/').pop() || path;
    merged.push({ path, name });
  }
  return merged;
}

export function simplePositionLabel(position: PreviewComment['position']): string {
  const normalized = normalizePosition(position);
  return `x${normalized.x} y${normalized.y}`;
}

export function selectionKindLabel(
  selectionKind: ChatCommentSelectionKind | undefined,
  memberCount?: number,
): string {
  if (selectionKind === 'visual') return 'Visual mark';
  if (selectionKind === 'pod') {
    return memberCount && memberCount > 0 ? `Pod · ${memberCount} items` : 'Pod';
  }
  return 'Element';
}

export function trimContextText(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function trimHtmlHint(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

/** Inline CSS for a visual-mark overlay box (preview-capture pixel coordinates). */
export function formatVisualMarkPlacementStyle(
  position: PreviewComment['position'],
): string {
  const pos = normalizePosition(position);
  // Enforce a minimum visible mark size so tiny/degenerate bounds still render
  // an obvious icon on the slide. Teamver decks are 1920×1080 — 32px is a
  // reasonable minimum touch target without dwarfing the drawn area.
  const width = Math.max(32, pos.width);
  const height = Math.max(32, pos.height);
  return `position:absolute;left:${pos.x}px;top:${pos.y}px;width:${width}px;height:${height}px`;
}

/** Model-facing placement rules for screenshot/drawing scoped edits. */
export function visualMarkPlacementGuidance(
  position: PreviewComment['position'],
): string {
  const pos = normalizePosition(position);
  return [
    'Preserve the current slide HTML from disk; do not redesign unrelated layout.',
    `Place the requested icon/shape inside the marked box at x=${pos.x} y=${pos.y} ${pos.width}x${pos.height} (slide canvas pixels; decks are 1920×1080).`,
    `Wrap the new markup in a container with style="${formatVisualMarkPlacementStyle(position)}" inside a position:relative slide root.`,
    'Size the icon/SVG to fill that box (width/height 100% or matching px).',
  ].join(' ');
}

export function renderCommentAttachmentContext(
  commentAttachments: ChatCommentAttachment[],
  options?: { includeQueryComments?: boolean },
): string {
  const lines = [
    '',
    '',
    '<attached-preview-comments>',
    "Hard scope: change ONLY the elements identified below by selector / position / pod members. Treat currentText/htmlHint as authoritative even if you cannot find the text elsewhere in prior chat. Do NOT modify sibling sub-pages, parent layout, global CSS, design tokens, or unrelated rules even if you notice issues there — surface those as a follow-up note in your reply instead of editing them. If the user's request cannot be satisfied without touching outside this scope, ask the user before proceeding. For visual marks, inspect the screenshot and modify the marked region first.",
  ];
  commentAttachments.forEach((item) => {
    const position = normalizePosition(item.pagePosition);
    const selectionKind =
      item.selectionKind === 'visual' ? 'visual' : item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${selectionKind}`,
      `file: ${item.filePath}`,
      'sourceFileContext: attached separately when this file exists in the project; inspect that attached-project-files content before saying the file is unavailable.',
      `label: ${item.label || '(unlabeled)'}`,
      `scopeLock: ${selectionKind === 'visual' ? 'marked visual region' : item.elementId || item.selector || 'selected element'}`,
      `position: x${position.x} y${position.y} ${position.width}x${position.height}`,
      `currentText: ${trimContextText(item.currentText || '') || '(empty)'}`,
      `htmlHint: ${trimHtmlHint(item.htmlHint || '') || '(none)'}`,
      `computedStyle: ${formatAnnotationStyle(item.style) || '(none)'}`,
    );
    // The 0-based slide index inside the current deck. Required so the model
    // can address the target slide via `<artifact type="element-patch">` or
    // `<artifact type="deck-patch">` on comment edits — without this line the
    // patch contract has no way to name the target.
    // Whole-file comments (no slide index at capture time) omit the line;
    // the model falls back to the full-deck path for those.
    if (typeof item.slideIndex === 'number' && Number.isFinite(item.slideIndex) && item.slideIndex >= 0) {
      lines.push(`slideIndex: ${Math.floor(item.slideIndex)}`);
    }
    if (
      item.comment
      && (options?.includeQueryComments || item.commentContext !== 'query')
    ) {
      lines.push(`comment: ${item.comment}`);
    }
    if (selectionKind === 'visual') {
      lines.push(
        `screenshot: ${item.screenshotPath || '(missing)'}`,
        `markKind: ${item.markKind || 'stroke'}`,
        `intent: ${item.intent || visualAnnotationIntent(item.markKind || 'stroke')}`,
        `placement: ${visualMarkPlacementGuidance(item.pagePosition)}`,
      );
      if (item.selector) lines.push(`selector: ${item.selector}`);
    } else {
      lines.splice(lines.length - 4, 0, `selector: ${item.selector}`);
    }
    if (selectionKind === 'pod') {
      lines.push(`memberCount: ${item.memberCount || item.podMembers?.length || 0}`);
      (item.podMembers ?? []).slice(0, 8).forEach((member, memberIndex) => {
        lines.push(
          `member.${memberIndex + 1}: ${member.elementId} | ${member.label || '(unlabeled)'} | ${member.selector}`,
        );
        lines.push(`member.${memberIndex + 1}.scopeLock: ${member.elementId || member.selector || 'selected pod member'}`);
        const memberText = trimContextText(member.text || '');
        if (memberText) lines.push(`member.${memberIndex + 1}.text: ${memberText}`);
        const memberHint = trimHtmlHint(member.htmlHint || '');
        if (memberHint) lines.push(`member.${memberIndex + 1}.htmlHint: ${memberHint}`);
        const memberPosition = normalizePosition(member.position);
        if (
          memberPosition.x
          || memberPosition.y
          || memberPosition.width
          || memberPosition.height
        ) {
          lines.push(
            `member.${memberIndex + 1}.position: x${memberPosition.x} y${memberPosition.y} ${memberPosition.width}x${memberPosition.height}`,
          );
        }
        const memberStyle = formatAnnotationStyle(member.style);
        if (memberStyle) lines.push(`member.${memberIndex + 1}.computedStyle: ${memberStyle}`);
      });
    }
    const imageAttachments = mergePreviewCommentAttachments(undefined, item.imageAttachments);
    if (imageAttachments.length > 0) {
      lines.push(`imageAttachments: ${imageAttachments.length}`);
      imageAttachments.forEach((attachment, attachmentIndex) => {
        // Second token must stay parseable (`path | name`) but must equal the
        // on-disk basename — never a friendlier display name models copy into src.
        const basename = String(attachment.path || '').split('/').pop() || attachment.path;
        lines.push(`image.${attachmentIndex + 1}: ${attachment.path} | ${basename}`);
      });
    }
  });
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Screenshot-only visual marks use synthetic `visual-mark-*` ids (or have no
 * extractable DOM target id). Those must not become REQUIRED element-patch
 * templates — the id is not in the deck HTML and persist cannot merge it.
 * Visual marks that still carry a real picked element target stay eligible.
 */
export function isScreenshotOnlyVisualCommentTarget(
  item: Pick<
    ChatCommentAttachment,
    'selectionKind' | 'markKind' | 'screenshotPath' | 'elementId' | 'selector' | 'htmlHint'
  >,
): boolean {
  const elementId = String(item.elementId || '').trim();
  const isVisual =
    item.selectionKind === 'visual'
    || Boolean(item.markKind)
    || Boolean(String(item.screenshotPath || '').trim())
    || elementId.startsWith('visual-mark-');
  if (!isVisual) return false;
  // Only extractable target ids count as DOM anchors. A bare class selector
  // (`h1.hero`) or prose htmlHint must not flip screenshot-only off — that
  // forces element-patch auto-continue with no concrete template.
  return concreteElementPatchTargetIds(item).length === 0;
}

/**
 * Ready-to-copy element-patch template with real target-id / slide-index
 * values so auto-continue retries do not depend on the model inferring
 * placeholders from prose.
 */
export function buildConcreteElementPatchTemplate(
  commentAttachments: readonly ChatCommentAttachment[],
): string | null {
  const blocks: string[] = [];
  for (const item of commentAttachments) {
    if (
      typeof item.slideIndex !== 'number'
      || !Number.isFinite(item.slideIndex)
      || item.slideIndex < 0
    ) {
      continue;
    }
    if (isScreenshotOnlyVisualCommentTarget(item)) continue;
    const targetIds = concreteElementPatchTargetIds(item);
    if (targetIds.length === 0) continue;
    const slideIndex = Math.floor(item.slideIndex);
    const removal = looksLikeRemovalCommentRequest(item.comment || '');
    const layoutOnly = !removal && looksLikeMarkupLayoutCommentRequest(item.comment || '');
    const alignmentOnly = !removal && !layoutOnly && looksLikeAlignmentCommentRequest(item.comment || '');
    const styleOnly = !removal && !layoutOnly && !alignmentOnly && looksLikeStyleOnlyCommentRequest(item.comment || '');
    const resolvedKind = removal
      ? 'remove-element'
      : layoutOnly
        ? 'set-outer-html'
        : 'set-style';
    const resolvedBody = removal
      ? ''
      : layoutOnly
        ? '&lt;tag&gt;줄바꿈 없이 한 줄 텍스트&lt;/tag&gt;'
        : alignmentOnly
          ? '{"textAlign":"center"}'
          : styleOnly
            ? '{"fontSize":"32px","fontWeight":"700"}'
            : null;
    const patchKind = resolvedBody === null ? 'set-text' : resolvedKind;
    const patchBody = resolvedBody ?? '(요청한 새 텍스트)';
    for (const targetId of targetIds) {
      blocks.push(
        '<artifact type="element-patch" identifier="deck">',
        `  <patch target-id="${escapeXmlAttr(targetId)}" slide-index="${slideIndex}" kind="${patchKind}">${patchBody}</patch>`,
        '</artifact>',
      );
    }
  }
  return blocks.length > 0 ? blocks.join('\n') : null;
}

/** deck-patch template for region-only visual marks (no concrete DOM target id). */
/** Inner markup for a visual-mark deck graft / patch template. */
export function buildVisualMarkDeckPatchInnerMarkup(comment: string): string {
  const normalized = String(comment || '').trim();
  if (/하트|heart|♥|❤/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="#e11d48" aria-hidden="true">',
      '        <path d="M12 21s-6.2-4.2-8.5-7.1C2.4 11.2 2.9 7.6 5.8 6.1c2.2-1.2 4.9-.5 6.2 1.5 1.3-2 4-2.7 6.2-1.5 2.9 1.5 3.4 5.1 1.3 7.8C18.2 16.8 12 21 12 21z"/>',
      '      </svg>',
    ].join('\n');
  }
  if (/별|star|⭐|★/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="#f59e0b" aria-hidden="true">',
      '        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/>',
      '      </svg>',
    ].join('\n');
  }
  if (/체크|check|✔|✓/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '        <polyline points="4,12 10,18 20,6"/>',
      '      </svg>',
    ].join('\n');
  }
  if (/원|동그라미|circle|⭕|○/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#ef4444" stroke-width="3" aria-hidden="true">',
      '        <circle cx="12" cy="12" r="9"/>',
      '      </svg>',
    ].join('\n');
  }
  if (/화살표|arrow|→|➡|↗|↘/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '        <line x1="4" y1="12" x2="20" y2="12"/>',
      '        <polyline points="14,6 20,12 14,18"/>',
      '      </svg>',
    ].join('\n');
  }
  if (/x표|엑스|cross|✕|✖|❌/iu.test(normalized)) {
    return [
      '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" aria-hidden="true">',
      '        <line x1="5" y1="5" x2="19" y2="19"/>',
      '        <line x1="19" y1="5" x2="5" y2="19"/>',
      '      </svg>',
    ].join('\n');
  }
  return '      <!-- robot/icon/SVG sized to fill this box (100% width/height) -->';
}

/**
 * Visible fallback marker used by the client visual-mark graft when the user
 * did not include a recognizable shape keyword. Without this, the mark div
 * renders as an empty box (invisible) and the send looks like it did nothing.
 */
export function buildClientVisualMarkFallbackInnerMarkup(): string {
  return [
    '      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="4 3" aria-hidden="true">',
    '        <rect x="2" y="2" width="20" height="20" rx="3"/>',
    '      </svg>',
  ].join('\n');
}

export function buildConcreteDeckPatchTemplateForVisualMarks(
  commentAttachments: readonly ChatCommentAttachment[],
): string | null {
  const blocks: string[] = [];
  for (const item of commentAttachments) {
    if (!isScreenshotOnlyVisualCommentTarget(item)) continue;
    if (hasUserTypedVisualAnnotationRequest(item)) continue;
    if (
      typeof item.slideIndex !== 'number'
      || !Number.isFinite(item.slideIndex)
      || item.slideIndex < 0
    ) {
      continue;
    }
    const slideIndex = Math.floor(item.slideIndex);
    const placementStyle = formatVisualMarkPlacementStyle(item.pagePosition);
    const innerMarkup = buildVisualMarkDeckPatchInnerMarkup(item.comment || '');
    blocks.push(
      '<artifact type="deck-patch" identifier="deck">',
      `  <section class="slide" data-slide-index="${slideIndex}" style="position:relative">`,
      '    <!-- REQUIRED: paste the FULL existing slide HTML for this index from deck.html, then ADD only this mark div before </section> -->',
      `    <div class="od-visual-mark-target" style="${placementStyle};display:flex;align-items:center;justify-content:center">`,
      innerMarkup,
      '    </div>',
      '  </section>',
      '</artifact>',
    );
  }
  return blocks.length > 0 ? blocks.join('\n') : null;
}

export function buildConcretePatchTemplatesForCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): string | null {
  const parts = [
    buildConcreteElementPatchTemplate(commentAttachments),
    buildConcreteDeckPatchTemplateForVisualMarks(commentAttachments),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join('\n\n') : null;
}

export function elementPatchCoerceHintsFromCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): Array<{ targetId: string; slideIndex: number }> {
  const hints: Array<{ targetId: string; slideIndex: number }> = [];
  for (const item of commentAttachments) {
    if (
      typeof item.slideIndex !== 'number'
      || !Number.isFinite(item.slideIndex)
      || item.slideIndex < 0
    ) {
      continue;
    }
    if (isScreenshotOnlyVisualCommentTarget(item)) continue;
    const slideIndex = Math.floor(item.slideIndex);
    for (const targetId of concreteElementPatchTargetIds(item)) {
      hints.push({ targetId, slideIndex });
    }
  }
  return hints;
}

/**
 * Resolve concrete DOM target ids for element-patch templates / coerce hints.
 * Prefer a real elementId; otherwise extract from selector / htmlHint attrs
 * so visual-mark-* + `[data-od-id=…]` still templates.
 */
function concreteElementPatchTargetIds(
  item: Pick<ChatCommentAttachment, 'elementId' | 'selector' | 'htmlHint'>,
): string[] {
  const ids: string[] = [];
  const push = (value: string): void => {
    const trimmed = String(value || '').trim();
    if (
      !trimmed
      || isSyntheticVisualMarkTargetId(trimmed)
      || isUnsafeElementPatchTargetId(trimmed)
      || isAttachedPreviewPlaceholder(trimmed)
    ) {
      return;
    }
    ids.push(trimmed);
  };
  push(String(item.elementId || ''));
  const sources = [String(item.selector || ''), String(item.htmlHint || '')];
  for (const source of sources) {
    if (!source.trim()) continue;
    for (const attr of ['data-od-id', 'data-screen-label', 'data-od-source-path', 'data-od-runtime-id']) {
      const re = new RegExp(`\\[${attr}=(?:"([^"]+)"|'([^']+)'|([^\\]\\s>]+))\\]`, 'gi');
      for (const match of source.matchAll(re)) {
        push(match[1] || match[2] || match[3] || '');
      }
    }
    // Bare htmlHint attributes: data-od-id="hero" without surrounding [].
    for (const match of source.matchAll(/\bdata-od-id\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
      push(match[1] || match[2] || match[3] || '');
    }
  }
  return [...new Set(ids)];
}

/** Serialize placeholders like `(none)` / `(empty)` must not round-trip as real data. */
function isAttachedPreviewPlaceholder(value: string | null | undefined): boolean {
  return /^\((?:none|empty|missing|unlabeled)\)$/i.test(String(value ?? '').trim());
}

function stripAttachedPreviewPlaceholder(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || isAttachedPreviewPlaceholder(raw)) return '';
  return raw;
}

function isUnsafeElementPatchTargetId(targetId: string): boolean {
  const normalized = String(targetId || '').trim().toLowerCase();
  return (
    normalized === 'body'
    || normalized === 'html'
    || normalized === 'document'
    || normalized === 'dom:body'
    || normalized === 'dom:html'
    || normalized === 'dom:document'
    || normalized === 'dom:body > body'
  );
}

function canAttachCommentSourceFile(path: string): boolean {
  const lower = path.toLowerCase();
  return /\.(html?|css|js|mjs|cjs|ts|tsx|json|md|txt|svg)$/.test(lower);
}

function imageOnlyCommentFallback(count: number): string {
  if (count <= 0) return '';
  return count > 1
    ? `Use the ${count} attached images as the comment reference.`
    : 'Use the attached image as the comment reference.';
}

export const VISUAL_ANNOTATION_USER_REQUEST_INTENT_PREFIX =
  'User request from the annotation note:';

function normalizeVisualMarkKindForIntent(
  markKind: string | undefined | null,
): PreviewVisualMarkKind {
  const kind = String(markKind || 'stroke').trim();
  if (
    kind === 'click' || kind === 'click+stroke' || kind === 'stroke'
    || kind === 'box' || kind === 'click+box'
  ) {
    return kind;
  }
  return 'stroke';
}

/**
 * True when the user typed an overlay note or used the box tool — the request
 * is "edit this region" (font size, copy, …), not "graft a decorative mark".
 */
export function hasUserTypedVisualAnnotationRequest(
  attachment: Pick<ChatCommentAttachment, 'markKind' | 'comment' | 'intent'>,
): boolean {
  const markKind = normalizeVisualMarkKindForIntent(attachment.markKind);
  if (markKind === 'box' || markKind === 'click+box') return true;
  const comment = String(attachment.comment || '').trim();
  if (!comment) return false;
  if (looksLikePlacementOnlyVisualMarkRequest(comment)) return false;
  return looksLikeVisualMarkEditRequest(comment);
}

/** Draw/memo screenshot attachments — not plain element picks without ink. */
export function isVisualCommentAttachment(attachment: ChatCommentAttachment): boolean {
  if (attachment.selectionKind === 'visual') return true;
  if (attachment.markKind) return true;
  if (String(attachment.screenshotPath || '').trim()) return true;
  const elementId = String(attachment.elementId || '').trim();
  if (elementId.startsWith('visual-mark-')) return true;
  return false;
}

/**
 * True for draw-annotation attachments: ink strokes or selection boxes on the
 * screenshot. Reconciler may later bind bounds to a real DOM id — intent is still
 * region/mark scoped, not "modify that element id" by default.
 */
export function isDrawnVisualMarkAttachment(attachment: ChatCommentAttachment): boolean {
  if (!isVisualCommentAttachment(attachment)) return false;
  if (
    attachment.markKind === 'stroke' || attachment.markKind === 'click+stroke'
    || attachment.markKind === 'box' || attachment.markKind === 'click+box'
  ) {
    return true;
  }
  if (attachment.selectionKind === 'visual' && Boolean(String(attachment.screenshotPath || '').trim())) {
    return true;
  }
  return false;
}

/**
 * Client graft adds a decorative overlay without an AI turn. Only placement-only
 * marks (pen + heart keyword, empty overlay note). Box marks and typed edit notes
 * route to the model.
 */
export function shouldClientGraftVisualMarkWithoutAi(
  attachment: ChatCommentAttachment,
): boolean {
  if (!isDrawnVisualMarkAttachment(attachment) && !isScreenshotOnlyVisualCommentTarget(attachment)) {
    return false;
  }
  if (hasUserTypedVisualAnnotationRequest(attachment)) return false;
  return true;
}

/** True when every usable attachment is a placement-only visual mark (client graft / deck-patch icon). */
export function isVisualMarkPlacementOnlyCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): boolean {
  const usable = filterUsableCommentAttachments(commentAttachments);
  if (usable.length === 0) return false;
  return usable.every((attachment) => shouldClientGraftVisualMarkWithoutAi(attachment));
}

export function visualAnnotationIntentForMarkKind(
  markKind: PreviewVisualMarkKind | string | undefined,
  userNote?: string,
): string {
  return visualAnnotationIntent(normalizeVisualMarkKindForIntent(markKind), userNote);
}

/** Shape/icon placement requests can still use the client graft fast path. */
function looksLikePlacementOnlyVisualMarkRequest(comment: string): boolean {
  return /하트|heart|♥|❤|별|star|⭐|★|체크|check|✔|✓|원|동그라미|circle|⭕|○|화살표|arrow|→|➡|↗|↘|x표|엑스|cross|✕|✖|❌/iu.test(
    comment,
  );
}

/** Resize / style / copy edits must reach the model — never client graft overlays. */
function looksLikeVisualMarkEditRequest(comment: string): boolean {
  return /크게|더\s*크|키워|늘려|작게|줄여|작아|커게|폰트|font|size|색|color|bold|굵게|얇게|align|정렬|텍스트|text|글씨|문구|제목|title|heading|바꿔|수정|변경/iu.test(
    comment,
  );
}

function visualAnnotationIntent(
  markKind: PreviewVisualMarkKind,
  userNote?: string,
): string {
  const note = String(userNote || '').trim();
  let base: string;
  if (markKind === 'click') {
    base = 'The screenshot has a blue focus box around the picked element; modify that picked part first.';
  } else if (markKind === 'click+box') {
    base =
      'The screenshot has a blue focus box around the picked element and a red selection box; the red box outlines the region the user wants changed.';
  } else if (markKind === 'click+stroke') {
    base = 'The screenshot has a blue focus box and red strokes; together they identify the part the user wants changed.';
  } else if (markKind === 'box') {
    base =
      'The screenshot has a red selection box that outlines the region the user wants changed. Treat the box as the intended target area—not decoration.';
  } else {
    base = 'The screenshot has red strokes that identify the visual region the user wants changed. Treat the drawn ink as the intended shape or placement guide—not decoration. ADD the requested shape/icon inside that region; do NOT delete or clear the rest of the slide.';
  }
  if (!note) return base;
  return `User request from the annotation note: "${note}". ${base}`;
}

function normalizePosition(input: PreviewComment['position']): PreviewComment['position'] {
  return {
    x: finite(input?.x),
    y: finite(input?.y),
    width: finite(input?.width),
    height: finite(input?.height),
  };
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}

function normalizeSelectionKind(
  selectionKind: PreviewCommentSnapshot['selectionKind'],
): PreviewCommentSelectionKind {
  return selectionKind === 'pod' ? 'pod' : 'element';
}

function normalizeMemberCount(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.round(value as number) : undefined;
}

function normalizeHoverPoint(
  input: PreviewCommentSnapshot['hoverPoint'],
): { x: number | undefined; y: number | undefined } {
  if (!input) return { x: undefined, y: undefined };
  return {
    x: Number.isFinite(input.x) ? Math.round(input.x) : undefined,
    y: Number.isFinite(input.y) ? Math.round(input.y) : undefined,
  };
}

function normalizeMembers(input: PreviewCommentMember[] | undefined): PreviewCommentMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => ({
      elementId: String(member.elementId || '').trim(),
      selector: String(member.selector || '').trim(),
      label: String(member.label || '').trim(),
      text: trimContextText(String(member.text || '')),
      position: normalizePosition(member.position),
      htmlHint: trimHtmlHint(String(member.htmlHint || '')),
      style: normalizeStyle(member.style),
    }))
    .filter((member) => member.elementId && member.selector);
}

function normalizeStyle(input: unknown): PreviewAnnotationStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const style: PreviewAnnotationStyle = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function formatAnnotationStyle(style: PreviewAnnotationStyle | undefined): string {
  if (!style) return '';
  return ANNOTATION_STYLE_KEYS
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${value}` : null;
    })
    .filter((item): item is string => Boolean(item))
    .join('; ');
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'textDecoration',
  'whiteSpace',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;
