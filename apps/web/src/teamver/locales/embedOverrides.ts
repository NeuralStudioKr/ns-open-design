import type { Dict } from "../../i18n/types";

const OPEN_DESIGN_BRAND_RE = /Open Design/g;

/** Keep package names / CLI snippets inside backticks unchanged. */
export function applyTeamverBrandToLocalizedText(text: string, brandTitle: string): string {
  const brand = brandTitle.trim();
  if (!brand) return text;

  const segments = text.split(/(`[^`]*`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return segment;
      }
      return segment.replace(OPEN_DESIGN_BRAND_RE, brand);
    })
    .join("");
}

/** Teamver embed 모드 i18n 오버라이드 (10 §4.4). locale별 확장 가능. */
export function teamverEmbedOverrides(
  title: string,
  subtitle?: string,
  hero?: { title?: string; subtitle?: string },
): Partial<Dict> {
  const overrides: Partial<Dict> = {
    "app.brand": title,
    "app.brandPill": "",
  };
  if (subtitle?.trim()) {
    overrides["app.brandSubtitle"] = subtitle.trim();
  }
  if (hero?.title?.trim()) {
    overrides["homeHero.title"] = hero.title.trim();
  }
  if (hero?.subtitle?.trim()) {
    overrides["homeHero.subtitlePrefix"] = hero.subtitle.trim();
  }
  // Project edit surface — strip OD product name from composer placeholders.
  overrides["chat.activeFilePlaceholder"] = "슬라이드 {file} 변경 요청…";
  overrides["chat.startTitle"] = "슬라이드 작업 시작";
  return overrides;
}

export function resolveTeamverEmbedTranslation(
  raw: string,
  branding: { enabled: boolean; title: string },
  keyOverrides: Partial<Dict>,
  key: keyof Dict,
): string {
  const fromOverride = keyOverrides[key];
  const base = fromOverride ?? raw;
  if (!branding.enabled) return base;
  return applyTeamverBrandToLocalizedText(base, branding.title);
}
