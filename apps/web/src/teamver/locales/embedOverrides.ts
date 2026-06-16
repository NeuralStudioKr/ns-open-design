import type { Dict } from "../../i18n/types";

/** Teamver embed 모드 i18n 오버라이드 (10 §4.4). locale별 확장 가능. */
export function teamverEmbedOverrides(title: string, subtitle?: string): Partial<Dict> {
  const overrides: Partial<Dict> = {
    "app.brand": title,
  };
  if (subtitle?.trim()) {
    overrides["app.brandSubtitle"] = subtitle.trim();
  }
  return overrides;
}
