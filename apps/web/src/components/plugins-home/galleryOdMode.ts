import type { InstalledPluginRecord } from '@open-design/contracts';

const DECK_ID_RE = /html-ppt|canvas-slide|deck-template|\bppt-/i;

function readOdTags(od: { tags?: unknown } | undefined): string[] {
  return Array.isArray(od?.tags) ? od.tags.map((tag) => String(tag).toLowerCase()) : [];
}

/**
 * Gallery / plus-menu thumbs key 16:9 isolation framing off `data-od-mode="deck"`.
 * Official catalog skills set `manifest.od.mode`, but community html-ppt rows
 * sometimes omit it — without the attribute they fall through to the tall
 * 1440×2200 hover-pan recipe and look cropped / wrongly focused.
 */
export function resolveGalleryOdMode(
  record: Pick<InstalledPluginRecord, 'id' | 'manifest'>,
  explicitMode?: unknown,
): string | undefined {
  if (typeof explicitMode === 'string' && explicitMode.trim()) {
    return explicitMode;
  }
  const od = record.manifest?.od as { mode?: unknown; tags?: unknown } | undefined;
  if (typeof od?.mode === 'string' && od.mode.trim()) {
    return od.mode;
  }
  const tags = [
    ...(record.manifest?.tags ?? []).map((tag) => tag.toLowerCase()),
    ...readOdTags(od),
  ];
  const id = `${record.id ?? ''} ${record.manifest?.id ?? ''}`;
  if (
    tags.includes('html-ppt')
    || tags.includes('deck')
    || tags.includes('canvas-slide')
    || DECK_ID_RE.test(id)
  ) {
    return 'deck';
  }
  return undefined;
}
