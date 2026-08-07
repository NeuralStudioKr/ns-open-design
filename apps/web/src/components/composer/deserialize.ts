import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from 'lexical';
import { $createMentionNode } from './MentionNode';
import { buildInlineMentionParts, type InlineMentionEntity } from '../../utils/inlineMentions';
import {
  isEphemeralDrawingScreenshotPath,
  isRenderableImagePath,
} from '../../utils/projectFilePaths';

/** Promote `@file.webp` tokens to file pills even when /files has not loaded yet. */
export function isPromotableFileMentionLabel(label: string): boolean {
  const trimmed = String(label || '').trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.includes(' ')) return false;
  if (isEphemeralDrawingScreenshotPath(trimmed)) return false;
  if (isRenderableImagePath(trimmed)) return true;
  // Non-image project files commonly mentioned from the toolbox / @ picker.
  return /\.(html?|md|txt|csv|json|pdf)$/i.test(trimmed);
}

// Rebuild the whole editor from a plain `@token` string. Known `@token`
// runs (matched against `entities`) become atomic MentionNodes; everything
// else is plain text. Newlines map to LineBreakNodes inside a single
// paragraph so serialization round-trips to single `\n`. Caret is placed at
// the end inside the same update so post-seed typing keeps the caret.
export function setComposerFromText(
  editor: LexicalEditor,
  text: string,
  entities: InlineMentionEntity[],
): void {
  // `discrete: true` commits the update synchronously. This matters both for
  // tests reading the state back on the next line AND for the host's
  // setText/clear → onChange round-trip, where a deferred update could let a
  // stale serialize slip through before the rebuild lands. On a mounted editor
  // it behaves like a normal update (just flushed immediately).
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) p.append($createLineBreakNode());
        if (!line) return;
        // highlightUnknown so `@msh9….webp` can be promoted to a file pill
        // before projectFiles / staged entities arrive after refresh.
        const parts = buildInlineMentionParts(line, entities, { highlightUnknown: true });
        if (!parts) {
          p.append($createTextNode(line));
          return;
        }
        for (const part of parts) {
          if (part.kind === 'mention' && part.entity.kind !== 'unknown') {
            p.append(
              $createMentionNode({
                mentionId: part.entity.id,
                mentionKind: part.entity.kind,
                token: part.text,
                label: part.entity.label,
                title: part.entity.title,
              }),
            );
          } else if (
            part.kind === 'mention'
            && part.entity.kind === 'unknown'
            && isPromotableFileMentionLabel(part.entity.label)
          ) {
            const label = part.entity.label.trim().replace(/\\/g, '/');
            p.append(
              $createMentionNode({
                mentionId: label,
                mentionKind: 'file',
                token: part.text,
                label,
                title: `File: ${label}`,
              }),
            );
          } else if (part.text) {
            p.append($createTextNode(part.text));
          }
        }
      });
      root.append(p);
      p.selectEnd();
    },
    { discrete: true },
  );
}
