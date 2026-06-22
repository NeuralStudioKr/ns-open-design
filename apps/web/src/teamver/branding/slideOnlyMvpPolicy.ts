import type { InstalledPluginRecord, SkillSummary } from "@open-design/contracts";
import type { CreateTab } from "../../components/NewProjectPanel";
import type { FacetSelection } from "../../components/plugins-home/facets";
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
import { isSlideRelatedDesignTemplate, isRenderableDesignTemplate } from "./designTemplateVisibility";

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

function readPluginMode(
  record: Pick<InstalledPluginRecord, "manifest">,
): string | undefined {
  const mode = record.manifest?.od?.mode;
  return typeof mode === "string" ? mode.trim() : undefined;
}

/** Official/community plugins with `manifest.od.mode === 'deck'`. */
export function isSlideRelatedPlugin(
  record: Pick<InstalledPluginRecord, "id" | "manifest">,
): boolean {
  return readPluginMode(record) === "deck";
}

export function pluginsForSlideOnlyMvp(
  plugins: readonly InstalledPluginRecord[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): InstalledPluginRecord[] {
  if (!branding.slideOnlyMvp) return [...plugins];
  return plugins.filter(isSlideRelatedPlugin);
}

const SLIDE_ONLY_HIDDEN_SKILL_CATEGORIES = new Set([
  "image-generation",
  "video-generation",
  "animation-motion",
]);

export function isSlideRelatedSkill(
  skill: Pick<SkillSummary, "mode" | "category">,
): boolean {
  const category = skill.category?.trim() ?? "";
  if (SLIDE_ONLY_HIDDEN_SKILL_CATEGORIES.has(category)) return false;
  if (skill.mode === "image" || skill.mode === "video" || skill.mode === "audio") {
    return false;
  }
  if (skill.mode === "prototype" || skill.mode === "template") return false;
  return true;
}

export function skillsForSlideOnlyMvp(
  skills: readonly SkillSummary[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): SkillSummary[] {
  if (!branding.slideOnlyMvp) return [...skills];
  return skills.filter((skill) => {
    if (isRenderableDesignTemplate(skill)) {
      return isSlideRelatedDesignTemplate(skill);
    }
    return isSlideRelatedSkill(skill);
  });
}

/** Default Community facet when slide-only MVP filters the catalog to decks. */
export const SLIDE_ONLY_COMMUNITY_FACET_SELECTION: FacetSelection = {
  category: "deck",
  subcategory: null,
};

/**
 * Embed slide-only Community: hide artifact-kind pills (Prototype·Video…)
 * while keeping deck scene subfacets. Full `CategoryRow` returns when
 * `slideOnlyMvp` is off — no facet code is removed.
 */
export function shouldHideCommunityPrimaryFacets(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp" | "hideCommunityGallery">,
): boolean {
  return branding.slideOnlyMvp && branding.hideCommunityGallery;
}

/** Facet UI props for Home `PluginsHomeSection` (gallery / Community). */
export function communityGalleryFacetUi(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp" | "hideCommunityGallery">,
): {
  hidePrimaryCategoryFacets: boolean;
  lockedFacetCategory: string | null;
} {
  const hidePrimaryCategoryFacets = shouldHideCommunityPrimaryFacets(branding);
  return {
    hidePrimaryCategoryFacets,
    lockedFacetCategory: hidePrimaryCategoryFacets
      ? SLIDE_ONLY_COMMUNITY_FACET_SELECTION.category
      : null,
  };
}

/**
 * Home "Community" (`PluginsHomeSection`) visibility.
 *
 * Standalone OD shows the full catalog. Embed sets `hideCommunityGallery` to
 * drop the unfiltered grid but keeps a slide-only Community strip when
 * `slideOnlyMvp` is on.
 */
export function shouldShowHomeCommunityGallery(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp" | "hideCommunityGallery">,
): boolean {
  if (!branding.hideCommunityGallery) return true;
  return branding.slideOnlyMvp;
}

/** @deprecated Use {@link shouldShowHomeCommunityGallery}. */
export function shouldShowEmbedSlideTemplateGallery(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp" | "hideCommunityGallery">,
): boolean {
  return shouldShowHomeCommunityGallery(branding);
}
