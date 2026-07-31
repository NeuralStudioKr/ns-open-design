/**
 * Host-side fallback for `od-edit-preview-style`. The iframe bridge is the
 * canonical path (postMessage → applyPreviewStyles) but not every artifact
 * carries the bridge (older exports, packaged fixtures, HTML uploaded from
 * outside the daemon), and some artifact CSS wins by specificity. srcDoc
 * previews are same-origin, so the host can also reach into `contentDocument`
 * and set the inline style with `!important` — matching what the bridge does,
 * but guaranteed to run regardless of bridge presence.
 *
 * This is preview-only. Persistence still flows through `applyManualEdit`.
 */

import type { ManualEditStyles } from './types';

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function cssEscape(value: string): string {
  const anyCss = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS;
  if (anyCss?.escape) return anyCss.escape(value);
  return value.replace(/"/g, '\\"');
}

export function findManualEditPreviewTarget(doc: Document, id: string): HTMLElement | null {
  if (!id) return null;
  if (id === '__body__') return doc.body as HTMLElement | null;
  const escaped = cssEscape(id);
  const byAttr = (
    doc.querySelector(`[data-od-id="${escaped}"]`)
    ?? doc.querySelector(`[data-od-runtime-id="${escaped}"]`)
    ?? doc.querySelector(`[data-od-source-path="${escaped}"]`)
    ?? doc.querySelector(`[data-screen-label="${escaped}"]`)
  ) as HTMLElement | null;
  if (byAttr) return byAttr;
  // Preview annotates unlabeled nodes with path-N; host fallback must walk
  // the same child-index path when attrs were not persisted to disk HTML.
  if (id.startsWith('path-')) {
    return findElementByChildPath(doc.body, id);
  }
  return null;
}

function findElementByChildPath(root: Element | null, id: string): HTMLElement | null {
  if (!root || !id.startsWith('path-')) return null;
  const indexes = id
    .slice('path-'.length)
    .split('-')
    .map((part) => Number(part));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0)) return null;
  let current: Element | null = root;
  for (const index of indexes) {
    current = current?.children.item(index) ?? null;
    if (!current) return null;
  }
  return current as HTMLElement;
}

export function applyManualEditPreviewStylesToDocument(
  doc: Document | null,
  id: string,
  styles: Partial<ManualEditStyles>,
): boolean {
  if (!doc) return false;
  const el = findManualEditPreviewTarget(doc, id);
  if (!el) return false;
  for (const [key, rawValue] of Object.entries(styles)) {
    const cssName = camelToKebab(key);
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
      el.style.removeProperty(cssName);
    } else {
      el.style.setProperty(cssName, rawValue.trim(), 'important');
    }
  }
  return true;
}

/**
 * Returns whether the iframe is host-accessible (same-origin srcDoc). Cross-
 * origin frames throw on `.contentDocument` access; treat that as "not
 * accessible" so we cleanly fall back to postMessage-only.
 */
export function iframeContentDocumentIfAccessible(
  frame: HTMLIFrameElement | null,
): Document | null {
  if (!frame) return null;
  try {
    return frame.contentDocument ?? null;
  } catch {
    return null;
  }
}

/**
 * Live border-box of a manual-edit target in iframe content coordinates
 * (`getBoundingClientRect` inside the frame). Used to keep host overlay /
 * target.rect aligned with the painted element after layout settles.
 */
export function measureManualEditTargetContentRect(
  frame: HTMLIFrameElement | null,
  id: string,
): { x: number; y: number; width: number; height: number } | null {
  const doc = iframeContentDocumentIfAccessible(frame);
  if (!doc || !id) return null;
  const el = findManualEditPreviewTarget(doc, id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!(rect.width >= 0) || !(rect.height >= 0)) return null;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
