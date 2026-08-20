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

import { isManualEditHostNode } from './bridge';
import {
  coerceManualEditStyleRecord,
  syncGraphicChildDimensionsFromStyles,
  syncSvgDimensionAttributesFromStyles,
} from './source-patches';
import type { ManualEditRect, ManualEditStyles } from './types';

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
    // Mirror bridge path ids — skip sandbox/shim/bridge host nodes so path-0
    // lands on content, not an injected host chrome sibling.
    if (!current) return null;
    const contentChildren: Element[] = Array.from(current.children).filter(
      (child) => !isManualEditHostNode(child),
    );
    current = contentChildren[index] ?? null;
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
  // Match persist coerce/allowlist so unitless lengths preview as they save.
  const coerced = coerceManualEditStyleRecord(styles as Record<string, unknown>);
  for (const [key, rawValue] of Object.entries(coerced)) {
    const cssName = camelToKebab(key);
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
      el.style.removeProperty(cssName);
    } else {
      el.style.setProperty(cssName, rawValue.trim(), 'important');
    }
  }
  syncSvgDimensionAttributesFromStyles(el, styles);
  syncGraphicChildDimensionsFromStyles(el, styles);
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

export type ManualEditTargetContentMeasure = {
  /** Visual border-box (`getBoundingClientRect`) — overlay alignment. */
  rect: ManualEditRect;
  /** Layout border-box (`offsetWidth`/`offsetHeight`) — CSS width/height space. */
  layoutWidth: number;
  layoutHeight: number;
};

/**
 * Live geometry of a manual-edit target in iframe coordinates.
 * `rect` follows transforms (deck fit scale); `layoutWidth`/`layoutHeight`
 * are the untransformed border-box used when writing CSS width/height.
 */
export function measureManualEditContentPageBounds(
  frame: HTMLIFrameElement | null,
): ManualEditRect | null {
  const doc = iframeContentDocumentIfAccessible(frame);
  if (!doc) return null;
  const canvas = doc.querySelector<HTMLElement>('.design-canvas');
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
  }
  const root = doc.documentElement;
  const width = Math.max(root.clientWidth, 1);
  const height = Math.max(root.clientHeight, 1);
  return { x: 0, y: 0, width, height };
}

/** Visible iframe viewport in content coordinates (for layer list filtering). */
export function measureManualEditViewportBounds(
  frame: HTMLIFrameElement | null,
): ManualEditRect | null {
  const doc = iframeContentDocumentIfAccessible(frame);
  if (!doc) return null;
  const width = doc.documentElement.clientWidth;
  const height = doc.documentElement.clientHeight;
  if (width < 1 || height < 1) return null;
  return { x: 0, y: 0, width, height };
}

export function measureManualEditTargetContentRect(
  frame: HTMLIFrameElement | null,
  id: string,
): ManualEditTargetContentMeasure | null {
  const doc = iframeContentDocumentIfAccessible(frame);
  if (!doc || !id) return null;
  const el = findManualEditPreviewTarget(doc, id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!(rect.width >= 0) || !(rect.height >= 0)) return null;
  return {
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    layoutWidth: Math.round(Math.max(1, el.offsetWidth || 0)),
    layoutHeight: Math.round(Math.max(1, el.offsetHeight || 0)),
  };
}

/**
 * Live border-box of a manual-edit target in the host workspace's absolute
 * content coordinates (padding edge + scroll).
 *
 * Projects the iframe-local element rect through the frame's *visual* box
 * (ancestor CSS scale included) rather than trusting React state for
 * `previewScale` / hostOffset. The drag overlay should call this so the
 * painted box cannot drift from the element when scale/offset state is
 * stale (iframe not ready yet, zoom shell remount, mobile scroll, etc.).
 */
export function measureManualEditTargetHostRect(
  frame: HTMLIFrameElement | null,
  host: HTMLElement | null,
  id: string,
): ManualEditRect | null {
  if (!frame || !host || !id) return null;
  const doc = iframeContentDocumentIfAccessible(frame);
  if (!doc) return null;
  const el = findManualEditPreviewTarget(doc, id);
  if (!el) return null;

  const elBox = el.getBoundingClientRect();
  if (!(elBox.width >= 0) || !(elBox.height >= 0)) return null;
  if (!(elBox.width >= 1) && !(elBox.height >= 1)) return null;

  const iframeBox = frame.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const layoutW = frame.offsetWidth;
  const layoutH = frame.offsetHeight;
  if (!(layoutW > 0) || !(layoutH > 0)) return null;
  if (!(iframeBox.width > 0) || !(iframeBox.height > 0)) return null;

  const scaleX = iframeBox.width / layoutW;
  const scaleY = iframeBox.height / layoutH;
  // Content viewport origin inside the (possibly CSS-scaled) iframe border box.
  const visualLeft = iframeBox.left + frame.clientLeft * scaleX + elBox.left * scaleX;
  const visualTop = iframeBox.top + frame.clientTop * scaleY + elBox.top * scaleY;

  return {
    x: visualLeft - hostBox.left - host.clientLeft + host.scrollLeft,
    y: visualTop - hostBox.top - host.clientTop + host.scrollTop,
    width: elBox.width * scaleX,
    height: elBox.height * scaleY,
  };
}
