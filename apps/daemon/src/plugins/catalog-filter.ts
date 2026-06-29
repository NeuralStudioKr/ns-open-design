import type { InstalledPluginRecord } from '@open-design/contracts';

/** `GET /api/plugins?mode=deck` — same contract as design-templates listing. */
export function parsePluginCatalogModeFilter(raw: unknown): string | null {
  if (raw == null) return null;
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const mode = value.trim().toLowerCase();
    if (mode) return mode;
  }
  return null;
}

export function readDefaultPluginCatalogModeFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return parsePluginCatalogModeFilter(env.OD_PLUGIN_CATALOG_DEFAULT_MODE);
}

export function isPluginCatalogModeMatch(
  plugin: Pick<InstalledPluginRecord, 'manifest'>,
  mode: string,
): boolean {
  const expected = mode.trim().toLowerCase();
  if (!expected) return true;
  const pluginMode = (plugin.manifest?.od?.mode ?? '').trim().toLowerCase();
  return pluginMode === expected;
}

export function filterInstalledPluginsByCatalogMode(
  plugins: readonly InstalledPluginRecord[],
  mode: string | null | undefined,
): InstalledPluginRecord[] {
  const expected = mode?.trim().toLowerCase();
  if (!expected) return [...plugins];
  return plugins.filter((plugin) => isPluginCatalogModeMatch(plugin, expected));
}
