import type { ManualEditKind, ManualEditTarget } from './types';

export const MANUAL_EDIT_RESIZE_MIN_PX = 24;

export function isDeckSlideRoot(target: ManualEditTarget): boolean {
  const tag = target.tagName.toLowerCase();
  const cls = ` ${target.className} `;
  return (
    (tag === 'section' || tag === 'div')
    && (/\bslide\b/.test(cls)
      || Boolean(target.attributes['data-slide'] || target.attributes['data-slide-index']))
  );
}

export function canResizeTarget(
  target: ManualEditTarget | null | undefined,
  options?: { inlineTextEditing?: boolean },
): boolean {
  if (!target || target.isHidden) return false;
  if (target.kind === 'token') return false;
  if (options?.inlineTextEditing) return false;
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
