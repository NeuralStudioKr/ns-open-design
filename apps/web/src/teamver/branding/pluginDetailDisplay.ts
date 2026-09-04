import type { PluginMetaOmit } from "../../components/plugin-details/PluginMetaSections";
import type { TeamverBrandingConfig } from "./config";

/**
 * Teamver slide-only Community / picker details are a look picker.
 * Hide generator-facing example prompts and manifest internals
 * (SKILL.md, CSS/MD bundles, fs paths) so they do not leak like the
 * Html Ppt scaffold inspector.
 */
export function teamverEndUserPluginMetaOmit(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  extra?: PluginMetaOmit,
): PluginMetaOmit {
  if (!branding.slideOnlyMvp) return { ...extra };
  return { ...extra, query: true, advanced: true };
}

/** Install command / marketplace / plugin-id share is generator chrome. */
export function shouldHideTeamverPluginDeveloperChrome(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): boolean {
  return branding.slideOnlyMvp === true;
}

/** open-design.ai public plugin pages stay outside the Teamver tenant. */
export function teamverPluginShareTargetUrl(
  branding: Pick<TeamverBrandingConfig, "hideExternalShareSurfaces">,
  publicUrl: string | null,
): string | undefined {
  if (branding.hideExternalShareSurfaces) return undefined;
  return publicUrl ?? undefined;
}
