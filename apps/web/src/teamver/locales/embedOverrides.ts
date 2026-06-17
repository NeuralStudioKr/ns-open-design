import type { Dict } from "../../i18n/types";

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
  return overrides;
}
