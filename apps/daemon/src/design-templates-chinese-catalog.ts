import {
  filterCatalogExcludingChinesePrimaryDeckTemplates,
  isChinesePrimaryDeckTemplate,
  readOdContentLocale,
} from '@open-design/contracts';

/** `OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN=1` — Teamver embed slide MVP catalog trim. */
export function readExcludeChineseDeckTemplatesFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function filterDesignTemplatesExcludingChinesePrimary<
  T extends { id: string; contentLocale?: string | null },
>(templates: readonly T[], enabled: boolean): T[] {
  return filterCatalogExcludingChinesePrimaryDeckTemplates(templates, enabled);
}

export function isExcludedChinesePrimaryDeckPlugin(
  plugin: { id: string; manifest?: { od?: unknown } },
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  return isChinesePrimaryDeckTemplate({
    id: plugin.id,
    contentLocale: readOdContentLocale(plugin.manifest?.od),
  });
}

export function filterPluginsExcludingChinesePrimaryDeck<
  T extends { id: string },
>(plugins: readonly T[], enabled: boolean): T[] {
  if (!enabled) return [...plugins];
  return plugins.filter((plugin) => !isExcludedChinesePrimaryDeckPlugin(plugin, enabled));
}

export { isChinesePrimaryDeckTemplate };
