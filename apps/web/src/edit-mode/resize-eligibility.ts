import {
  classAttrHasDeckSlideToken,
  classAttrHasTemplateSlideAlias,
} from '@open-design/contracts';
import type { ManualEditKind, ManualEditTarget } from './types';

export const MANUAL_EDIT_RESIZE_MIN_PX = 24;

/**
 * Deck slide roots must not resize/move as ordinary boxes.
 * Empty `data-slide=""` still counts — presence of the attribute is enough.
 */
export function isDeckSlideRoot(target: ManualEditTarget): boolean {
  const tag = target.tagName.toLowerCase();
  const cls = ` ${target.className} `;
  if (tag !== 'section' && tag !== 'div') return false;
  if (classAttrHasDeckSlideToken(cls) || classAttrHasTemplateSlideAlias(cls)) return true;
  if (target.attributes['data-slide'] != null) return true;
  if (target.attributes['data-slide-index'] != null) return true;
  const label = target.attributes['data-screen-label'];
  if (label != null && /^\d{2}(?:\s|$)/.test(String(label))) return true;
  return false;
}

export function canResizeTarget(
  target: ManualEditTarget | null | undefined,
  options?: { inlineTextEditing?: boolean; editMode?: boolean },
): boolean {
  if (!target) return false;
  if (options?.editMode === false) return false;
  if (options?.inlineTextEditing) return false;
  if (target.isHidden) return false;
  if (target.kind === 'token') return false;
  if (isDeckSlideRoot(target)) return false;
  if (target.rect.width < 4 || target.rect.height < 4) return false;
  return target.kind === 'text'
    || target.kind === 'link'
    || target.kind === 'image'
    || target.kind === 'container';
}

export function aspectLockForTarget(kind: ManualEditKind, shiftKey: boolean): boolean {
  if (kind === 'image') return !shiftKey;
  return shiftKey;
}
