import { useT } from "../../i18n";
import { useTeamverBranding } from "./TeamverBrandingProvider";

/** embed 시 `VITE_TEAMVER_BRAND_TITLE`, 기본은 i18n `app.brand`. */
export function useBrandLabel(): string {
  const t = useT();
  const { enabled, title } = useTeamverBranding();
  return enabled ? title : t("app.brand");
}
