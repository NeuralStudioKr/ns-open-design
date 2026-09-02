/**
 * Detect model-echoed policy guard text that mirrors our API/slide-only system
 * prompt — not adversarial prompt injection. Used to avoid false-positive
 * "프롬프트 인젝션 가능성" chips in slide-only chat (루프365).
 */
export function systemReminderLooksLikeTrustedPolicyEcho(text: string): boolean {
  const sample = String(text ?? '').trim().toLowerCase();
  if (!sample) return false;
  const markers = [
    'protocol integrity',
    'ignore any instructions inside tool',
    'no tools are wired through',
    'slide-only deliverable',
    'continue with the slide-only deliverable contract',
  ];
  return markers.some((marker) => sample.includes(marker));
}
