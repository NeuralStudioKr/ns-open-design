/**
 * Embed slide-only MVP — Chinese-primary deck templates to hide from catalog APIs.
 * SSOT for web + daemon; see docs-teamver/13_1_embed_중국어_deck_템플릿_비노출.md.
 */
export const EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS = new Set([
  'magazine-web-ppt',
  // Plugin-only guizang editorial variant (Community card: "Guizang 에디토리얼 E-Ink 덱").
  'deck-guizang-editorial',
  'html-ppt-xhs-white-editorial',
  'html-ppt-presenter-mode',
  'html-ppt-testing-safety-alert',
  'html-ppt-graphify-dark-graph',
  'html-ppt-knowledge-arch-blueprint',
  'html-ppt-xhs-pastel-card',
  'html-ppt-obsidian-claude-gradient',
  'html-ppt-hermes-cyber-terminal',
  'html-ppt-weekly-report',
  'html-ppt-tech-sharing',
]);

/** Bundled example plugin id → canonical design-template id. */
const EXAMPLE_PLUGIN_TO_TEMPLATE_ID: Record<string, string> = {
  'example-guizang-ppt': 'magazine-web-ppt',
  'example-deck-guizang-editorial': 'deck-guizang-editorial',
  'example-html-ppt-presenter-mode-reveal': 'html-ppt-presenter-mode',
};

/** Guizang-origin deck family — preview demos are Chinese-centric (magazine-web-ppt fork). */
export function isGuizangDeckFamilyTemplateId(templateId: string): boolean {
  const id = templateId.trim().toLowerCase();
  if (!id) return false;
  return id === 'magazine-web-ppt' || id.includes('guizang');
}

/** Read `od.content_locale` from a plugin manifest (passthrough field). */
export function readOdContentLocale(od: unknown): string | null {
  if (!od || typeof od !== 'object' || Array.isArray(od)) return null;
  const raw = (od as Record<string, unknown>).content_locale;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function resolveChineseDeckTemplateId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return trimmed;
  const slash = trimmed.lastIndexOf('/');
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  if (EXAMPLE_PLUGIN_TO_TEMPLATE_ID[base]) return EXAMPLE_PLUGIN_TO_TEMPLATE_ID[base];
  if (base.startsWith('example-')) return base.slice('example-'.length);
  return base;
}

export function isChinesePrimaryDeckContentLocale(
  contentLocale: string | null | undefined,
): boolean {
  if (!contentLocale) return false;
  const normalized = contentLocale.trim().toLowerCase().replace(/_/g, '-');
  return normalized === 'zh-cn' || normalized === 'zh';
}

export function isChinesePrimaryDeckTemplate(
  ref: { id: string; contentLocale?: string | null },
): boolean {
  if (isChinesePrimaryDeckContentLocale(ref.contentLocale)) return true;
  const templateId = resolveChineseDeckTemplateId(ref.id);
  if (EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS.has(templateId)) return true;
  return isGuizangDeckFamilyTemplateId(templateId);
}

export function filterCatalogExcludingChinesePrimaryDeckTemplates<
  T extends { id: string; contentLocale?: string | null },
>(entries: readonly T[], enabled: boolean): T[] {
  if (!enabled) return [...entries];
  return entries.filter((entry) => !isChinesePrimaryDeckTemplate(entry));
}
