import type { CreateTab } from "../../components/NewProjectPanel";
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from "../../components/home-hero/chips";
import type { TeamverBrandingConfig } from "./config";

/** Home hero chip ids hidden in embed slide-only MVP. */
export const TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS = new Set([
  "prototype",
  "hyperframes",
  "live-artifact",
  "image",
  "video",
  "audio",
  "create-plugin",
  "figma",
]);

/** New project modal tabs hidden in embed slide-only MVP. */
export const TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS = new Set<CreateTab>([
  "prototype",
  "live-artifact",
  "media",
  "other",
]);

export const TEAMVER_EMBED_DEFAULT_HOME_HERO_CHIP_ID = "deck";
export const TEAMVER_EMBED_DEFAULT_NEW_PROJECT_TAB: CreateTab = "deck";

export function homeHeroChipsForGroup(
  group: ChipGroup,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): HomeHeroChip[] {
  const chips = chipsForGroup(group);
  if (!branding.slideOnlyMvp) return chips;
  return chips.filter((chip) => !TEAMVER_EMBED_HIDDEN_HOME_HERO_CHIP_IDS.has(chip.id));
}

export function visibleNewProjectTabs(
  allTabs: readonly CreateTab[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): CreateTab[] {
  if (!branding.slideOnlyMvp) return [...allTabs];
  return allTabs.filter((tab) => !TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS.has(tab));
}

export function coerceNewProjectTab(
  tab: CreateTab,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): CreateTab {
  if (!branding.slideOnlyMvp) return tab;
  if (!TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS.has(tab)) return tab;
  return TEAMVER_EMBED_DEFAULT_NEW_PROJECT_TAB;
}

export function defaultNewProjectTab(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): CreateTab {
  return branding.slideOnlyMvp
    ? TEAMVER_EMBED_DEFAULT_NEW_PROJECT_TAB
    : "prototype";
}

export function defaultHomeHeroGuideChipId(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): string {
  return branding.slideOnlyMvp
    ? TEAMVER_EMBED_DEFAULT_HOME_HERO_CHIP_ID
    : "prototype";
}
