import { useTeamverBranding } from "./TeamverBrandingProvider";
import { useTeamverT } from "./useTeamverT";

/** embed 시 `VITE_TEAMVER_BRAND_TITLE`, 기본은 i18n `app.brand`. */
export function useBrandLabel(): string {
  const t = useTeamverT();
  const { enabled, title } = useTeamverBranding();
  return enabled ? title : t("app.brand");
}
