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

function findManualEditPreviewTarget(doc: Document, id: string): HTMLElement | null {
  if (!id) return null;
  if (id === '__body__') return doc.body as HTMLElement | null;
  const escaped = cssEscape(id);
  return (
    doc.querySelector(`[data-od-id="${escaped}"]`)
    ?? doc.querySelector(`[data-od-runtime-id="${escaped}"]`)
    ?? doc.querySelector(`[data-od-source-path="${escaped}"]`)
  ) as HTMLElement | null;
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
