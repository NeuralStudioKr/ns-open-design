import { useCallback, useMemo } from "react";
import { useT } from "../../i18n";
import type { Dict } from "../../i18n/types";
import { teamverEmbedOverrides } from "../locales/embedOverrides";
import { useTeamverBranding } from "./TeamverBrandingProvider";

type DictKey = keyof Dict;

/** embed 시 브랜딩·i18n 오버라이드가 적용된 translator. */
export function useTeamverT() {
  const t = useT();
  const branding = useTeamverBranding();
  const overrides = useMemo(
    () =>
      branding.enabled
        ? teamverEmbedOverrides(branding.title, branding.subtitle, {
            title: branding.heroTitle,
            subtitle: branding.heroSubtitle,
          })
        : {},
    [
      branding.enabled,
      branding.title,
      branding.subtitle,
      branding.heroTitle,
      branding.heroSubtitle,
    ],
  );

  return useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      const override = overrides[key];
      if (override != null) return override;
      return t(key, vars);
    },
    [t, overrides],
  );
}
