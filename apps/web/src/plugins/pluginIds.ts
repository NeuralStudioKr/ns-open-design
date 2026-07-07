import type { InstalledPluginRecord } from '@open-design/contracts';

export function normalizePluginApiId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed.includes('/')) return trimmed;
  const segments = trimmed.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? trimmed;
}

export function installedPluginApiId(record: InstalledPluginRecord): string {
  const manifestName = record.manifest?.name;
  if (typeof manifestName === 'string' && manifestName.trim()) {
    return normalizePluginApiId(manifestName);
  }
  return normalizePluginApiId(record.id);
}
