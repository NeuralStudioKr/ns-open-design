/**
 * Deck / host arrow-key slide navigation must yield to inline text editing.
 * `contenteditable="plaintext-only"` is not reliably reported via
 * `HTMLElement.isContentEditable` in every engine, so also honor our
 * `data-od-editing` marker and any non-false contenteditable ancestor.
 */

export function isManualEditKeyboardTextTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => Element | null;
  };
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest !== 'function') return false;
  return Boolean(
    el.closest('[data-od-editing="true"]')
    || el.closest('[contenteditable]:not([contenteditable="false"])'),
  );
}
