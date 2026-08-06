import {
  manualEditStableIdForElement,
} from './bridge';
import { resolveGraphicContainerTarget } from './manual-edit-graphic-container';
import { findManualEditPreviewTarget } from './manual-edit-host-preview';

/** DOM ancestry for manual-edit ids (data-od-id, source-path, screen-label, path-*). */
export function manualEditTargetIsDescendantOfInDocument(
  doc: Document | null | undefined,
  childId: string,
  ancestorId: string,
): boolean {
  if (!doc || childId === ancestorId) return false;
  const child = findManualEditPreviewTarget(doc, childId);
  const ancestor = findManualEditPreviewTarget(doc, ancestorId);
  if (!child || !ancestor) return false;
  return ancestor.contains(child);
}

/**
 * Deck cover icons: layers / additive select may still reference the inner
 * svg/img — redirect to the absolute/fixed graphic wrapper when applicable.
 */
export function resolveManualEditGraphicContainerId(
  doc: Document | null | undefined,
  id: string,
): string {
  if (!doc || !id) return id;
  const el = findManualEditPreviewTarget(doc, id);
  if (!el) return id;
  const resolved = resolveGraphicContainerTarget(el);
  if (resolved === el) return id;
  return manualEditStableIdForElement(resolved);
}
