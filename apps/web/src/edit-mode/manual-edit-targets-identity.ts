/**
 * Selected-target identity fingerprint for od-edit-targets broadcasts.
 * Geometry-only remasures must not force inspector reseed (기획 59 + 51–53).
 */

import { MANUAL_EDIT_STYLE_PROPS, type ManualEditStyles, type ManualEditTarget } from './types';

/** Style keys that track box geometry — idle remasure owns these, not identity. */
export const MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS = new Set<keyof ManualEditStyles>([
  'width', 'height', 'minHeight', 'maxWidth', 'maxHeight',
  'left', 'top', 'right', 'bottom',
]);

/** Identity fingerprint for od-edit-targets — skips geometry-only rebroadcasts. */
export function manualEditTargetsIdentityFingerprint(targets: ManualEditTarget[]): string {
  return targets.map((target) => [
    target.id,
    target.kind,
    target.tagName,
    target.className,
    target.text,
    target.fields?.href ?? '',
    target.fields?.src ?? '',
    target.fields?.alt ?? '',
    target.outerHtml?.length ?? 0,
    target.isHidden ? '1' : '0',
    // Style identity without box geometry so idle remasure / move / resize
    // do not force mixed-inspector reseed (기획 59 + 51–53).
    MANUAL_EDIT_STYLE_PROPS
      .filter((key) => !MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS.has(key))
      .map((key) => target.styles?.[key] ?? '')
      .join('\x1e'),
  ].join('\0')).join('\n');
}
