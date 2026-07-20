import type { InstalledPluginRecord } from '@open-design/contracts';

export function normalizePluginApiId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed.includes('/')) return trimmed;
  const segments = trimmed.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? trimmed;
}

/**
 * Daemon `/api/plugins/:id/*` keys on `installed_plugins.id`. Prefer that over
 * `manifest.name` — short names like `example-html-ppt` can be aliases that are
 * not the install row id (and may lack on-disk preview HTML).
 */
export function installedPluginApiId(record: InstalledPluginRecord): string {
  if (typeof record.id === 'string' && record.id.trim()) {
    return normalizePluginApiId(record.id);
  }
  const manifestName = record.manifest?.name;
  if (typeof manifestName === 'string' && manifestName.trim()) {
    return normalizePluginApiId(manifestName);
  }
  return '';
}
