import {
  deriveDeckCoverTitleFromBrief,
  isGenericDeckArtifactTitle,
} from '@open-design/contracts';

type PersistTitleSource = {
  title?: string | null;
  identifier?: string | null;
};

/**
 * Persist manifest + rejection-banner label. Prefer a real model title,
 * never `deck` / `response` / `untitled` from the parser identifier.
 */
export function resolvePersistDeckDisplayTitle(
  art: PersistTitleSource,
  brief: string,
  deckTitle?: string | null,
): string {
  const named = [art.title, art.identifier]
    .map((value) => String(value ?? '').trim())
    .find((value) => value && !isGenericDeckArtifactTitle(value));
  if (named) return named;
  return deriveDeckCoverTitleFromBrief(brief, deckTitle || '슬라이드') || '슬라이드';
}
