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
    // Bridge catalogs always send outerHtml: '' — including length flipped tip
    // identity fingerprints and Mixed after sticky clear (474). Markup identity
    // is covered by text/fields/className instead.
    target.isHidden ? '1' : '0',
    // Style identity without box geometry so idle remasure / move / resize
    // do not force mixed-inspector reseed (기획 59 + 51–53).
    // Omit empty / whitespace values so tip-sparse '' and missing keys hash
    // the same — bridge computed fills still need soft-land/preserve (484).
    MANUAL_EDIT_STYLE_PROPS
      .filter((key) => !MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS.has(key))
      .map((key) => {
        const value = target.styles?.[key];
        if (value == null) return null;
        const trimmed = String(value).trim();
        return trimmed === '' ? null : `${key}=${trimmed}`;
      })
      .filter((entry): entry is string => entry != null)
      .join('\x1e'),
  ].join('\0')).join('\n');
}
