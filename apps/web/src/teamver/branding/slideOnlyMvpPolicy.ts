import type { CreateTab } from "../../components/NewProjectPanel";
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from "../../components/home-hero/chips";
import type {
  DesignToolboxAction,
  DesignToolboxActionId,
} from "../../runtime/design-toolbox";
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

/**
 * Design toolbox action ids hidden when slide-only MVP is on.
 *
 * `image-gen` / `video-gen` create new media projects — out of scope for the
 * deck-first launch. `motion` / `motion-polish` target animation/HyperFrames
 * workflows. The remaining actions (`auto-match`, `visual-polish`,
 * `anti-ai-polish`) all read as deck-applicable polish flows.
 */
export const TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS = new Set<
  DesignToolboxActionId
>(["image-gen", "video-gen", "motion", "motion-polish"]);

export function visibleDesignToolboxActions(
  actions: readonly DesignToolboxAction[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): DesignToolboxAction[] {
  if (!branding.slideOnlyMvp) return [...actions];
  return actions.filter(
    (action) => !TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has(action.id),
  );
}

export function visibleDesignToolboxActionIds(
  ids: readonly DesignToolboxActionId[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): DesignToolboxActionId[] {
  if (!branding.slideOnlyMvp) return [...ids];
  return ids.filter(
    (id) => !TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS.has(id),
  );
}
