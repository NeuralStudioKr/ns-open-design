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

export type ManualEditDeleteKeyboardInput = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'repeat' | 'shiftKey' | 'target'
>;

/** Delete / Backspace removes the selected manual-edit target (when not typing). */
export function resolveManualEditDeleteKeyboardAction(
  event: ManualEditDeleteKeyboardInput,
): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (isManualEditKeyboardTextTarget(event.target)) return false;
  return event.key === 'Delete' || event.key === 'Backspace';
}

/** Single-select only. Empty ids may still resolve via the primary inspector target. */
export function resolveManualEditDeleteTargetId(
  selectedIds: readonly string[],
  primaryId?: string | null,
): string | null {
  if (selectedIds.length === 1) return selectedIds[0] ?? null;
  if (selectedIds.length === 0 && primaryId) return primaryId;
  return null;
}
