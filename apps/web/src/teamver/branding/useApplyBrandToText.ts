import { useCallback } from "react";
import { applyTeamverBrandToLocalizedText } from "../locales/embedOverrides";
import { useTeamverBranding } from "./TeamverBrandingProvider";

/** Replace upstream "Open Design" product name in ad-hoc UI copy (embed only). */
export function useApplyBrandToText() {
  const { enabled, title } = useTeamverBranding();
  return useCallback(
    (text: string) => (enabled ? applyTeamverBrandToLocalizedText(text, title) : text),
    [enabled, title],
  );
}
