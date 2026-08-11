import type { InstalledPluginRecord, SkillSummary } from "@open-design/contracts";
import {
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  defaultScenarioPluginIdForKind,
} from "@open-design/contracts";
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
import { isEmbedHiddenChinesePrimaryDeckTemplate, readOdContentLocale } from "./embedChineseDeckTemplatePolicy";

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
  // Template picker can spawn non-deck / od-new-generation projects.
  "template",
]);

/** New project modal tabs hidden in embed slide-only MVP. */
export const TEAMVER_EMBED_HIDDEN_NEW_PROJECT_TABS = new Set<CreateTab>([
  "prototype",
  "live-artifact",
  "media",
  "other",
  "template",
]);

export const TEAMVER_EMBED_DEFAULT_HOME_HERO_CHIP_ID = "deck";
export const TEAMVER_EMBED_DEFAULT_NEW_PROJECT_TAB: CreateTab = "deck";

/** Deck scenario used when slide-only embed would otherwise bind od-default / routers. */
export const TEAMVER_EMBED_SLIDE_SCENARIO_PLUGIN_ID =
  defaultScenarioPluginIdForKind("deck") ?? "example-simple-deck";

const SLIDE_ONLY_COERCED_ROUTER_PLUGIN_IDS = new Set([
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  "od-new-generation",
  "od-media-generation",
  "od-figma-migration",
  "od-code-migration",
  "od-tune-collab",
  "od-plugin-authoring",
  "example-web-prototype",
  "example-live-artifact",
  "example-hyperframes",
]);

/**
 * Pin Home / NewProject create to the deck scenario in slide-only embed.
 * Community `mode: deck` plugins keep their id; routers and non-deck examples coerce.
 */
export function resolveSlideOnlyCreatePluginId(
  pluginId: string | null | undefined,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): string | null {
  if (!branding.slideOnlyMvp) return pluginId?.trim() || null;
  const trimmed = pluginId?.trim() || "";
  if (!trimmed || SLIDE_ONLY_COERCED_ROUTER_PLUGIN_IDS.has(trimmed)) {
    return TEAMVER_EMBED_SLIDE_SCENARIO_PLUGIN_ID;
  }
  return trimmed;
}

/**
 * Resolve a community / free-form deck visual template id for Home create.
 *
 * `explicitPick` is accepted for call-site compatibility but no longer gates
 * persistence: free-form binds that leave a `mode: deck` plugin on `active`
 * (without the chip-default scenario / routers) must still write
 * `selectedDeckTemplate*` metadata so ProjectView / daemon can compose it.
 */
export function resolveSlideOnlyDeckTemplateSkillId(
  plugin: InstalledPluginRecord | null | undefined,
  _options?: { explicitPick?: boolean | null },
): string | null {
  const id = plugin?.id?.trim() ?? "";
  if (!id) return null;
  if (SLIDE_ONLY_COERCED_ROUTER_PLUGIN_IDS.has(id)) return null;
  // Scenario generator is the create plugin, not a visual template skill.
  if (id === TEAMVER_EMBED_SLIDE_SCENARIO_PLUGIN_ID || id === "example-simple-deck") {
    return null;
  }
  if (plugin?.manifest?.od?.mode !== "deck") return null;
  return id;
}

export const TEAMVER_AUTO_DECK_VISUAL_TEMPLATE_LABEL =
  "Auto-match a deck template from the user's brief";

type SlideOnlyDeckVisualProfile = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly keywords: readonly RegExp[];
};

const SLIDE_ONLY_DECK_VISUAL_PROFILES: readonly SlideOnlyDeckVisualProfile[] = [
  {
    id: "developer-portfolio",
    label: "Developer portfolio",
    hint: "developer portfolio deck: bold personal cover, strong typographic hierarchy, skill chips, project/case-study rhythm",
    keywords: [
      /portfolio|포트폴리오|resume|career|이력|채용/i,
      /developer|frontend|backend|full[-\s]?stack|engineer|개발자|프론트엔드|백엔드/i,
    ],
  },
  {
    id: "editorial-marketing",
    label: "Editorial marketing strategy",
    hint: "marketing strategy deck: editorial report style, strong section openers, KPI cards, channel roadmap layouts",
    keywords: [
      /marketing|campaign|go[-\s]?to[-\s]?market|마케팅|캠페인/i,
      /market|strategy|positioning|persona|channel|전략|시장|페르소나|채널/i,
    ],
  },
  {
    id: "modern-tech",
    label: "Modern technology",
    hint: "modern tech deck: dark or high-contrast canvas, clean grid, neon/accent metrics, product-system diagrams",
    keywords: [
      /ai|artificial intelligence|인공지능|llm|agent|automation/i,
      /adoption|transformation|도입|자동화|전환/i,
      /data|analytics|tech|saas|cloud|cyber|security|데이터|기술|보안/i,
    ],
  },
  {
    id: "executive-report",
    label: "Executive business report",
    hint: "business report deck: executive summary, metric dashboard cards, comparison tables, restrained data visuals",
    keywords: [
      /finance|revenue|sales|budget|재무|매출|예산|영업/i,
      /kpi|roi|metric|performance|성과|지표|효과|비용/i,
    ],
  },
  {
    id: "startup-pitch",
    label: "Startup pitch",
    hint: "startup pitch deck: confident narrative arc, big claims, traction metrics, market/product/roadmap slides",
    keywords: [
      /pitch|investor|fundraising|투자자|피치|IR/i,
      /startup|product|roadmap|traction|스타트업|제품|로드맵/i,
    ],
  },
  {
    id: "onboarding-guide",
    label: "Onboarding guide",
    hint: "onboarding deck: friendly structured guide, warm welcome cover, process timelines, checklist sections",
    keywords: [
      /onboarding|orientation|new hire|온보딩|신입|입문/i,
      /employee|training|guide|education|직원|교육|가이드|매뉴얼/i,
    ],
  },
  {
    id: "creative-editorial",
    label: "Creative editorial",
    hint: "creative editorial deck: expressive typography, warm paper or gallery-like canvas, asymmetrical layouts, memorable section moments",
    keywords: [
      /creative|brand|branding|design|브랜드|브랜딩|디자인|크리에이티브/i,
      /story|culture|vision|identity|스토리|문화|비전|아이덴티티/i,
    ],
  },
];

function stableBriefHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scoreSlideOnlyDeckVisualProfile(
  profile: SlideOnlyDeckVisualProfile,
  text: string,
): number {
  let score = 0;
  for (const keyword of profile.keywords) {
    if (keyword.test(text)) score += 2;
  }
  return score;
}

export function inferSlideOnlyDeckVisualTemplateHint(topicHint?: string | null): string {
  const text = (topicHint ?? "").trim();
  if (!text) return TEAMVER_AUTO_DECK_VISUAL_TEMPLATE_LABEL;
  const lower = text.toLowerCase();
  const scored = SLIDE_ONLY_DECK_VISUAL_PROFILES
    .map((profile) => ({
      profile,
      score: scoreSlideOnlyDeckVisualProfile(profile, lower),
    }))
    .filter((item) => item.score > 0);
  if (scored.length === 0) return TEAMVER_AUTO_DECK_VISUAL_TEMPLATE_LABEL;
  const maxScore = Math.max(...scored.map((item) => item.score));
  const tied = scored
    .filter((item) => item.score === maxScore)
    .map((item) => item.profile)
    .sort((a, b) => a.id.localeCompare(b.id));
  const picked = tied[stableBriefHash(lower) % tied.length]!;
  return picked.hint;
}

export function defaultSlideOnlyDeckPluginInputs(topicHint?: string | null): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the user brief";
  const visualTemplate = inferSlideOnlyDeckVisualTemplateHint(topic);
  return {
    deckType: "pitch deck",
    topic,
    audience: "decision makers",
    slideCount: "6-8 pages",
    speakerNotes: "no speaker notes",
    designSystem: "auto-match the visual direction from the user's brief unless a project design system is explicitly active",
    visualTemplate,
    visualTemplatePolicy:
      "If the user did not explicitly pick a template, infer the best-fitting deck visual language from the brief; do not fall back to a generic default look.",
  };
}

export function explicitSlideOnlyDeckTemplatePluginInputs(
  templateTitle?: string | null,
  templateId?: string | null,
): Record<string, unknown> {
  const title = templateTitle?.trim();
  if (!title) return {};
  return {
    designSystem: title,
    visualTemplate: title,
    ...(templateId?.trim() ? { selectedDeckTemplateId: templateId.trim() } : {}),
    selectedDeckTemplateTitle: title,
    visualTemplatePolicy:
      "The user explicitly picked this deck template. Its Template visual kit / preview HTML is the primary visual contract: preserve palette, typography, borders, and recognizable Decoration CSS / Motif sprites as compact inline cues; do not fall back to a generic default look, dump a head/style shell, or substitute emoji ornaments.",
  };
}

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
  return plugins.filter(
    (plugin) =>
      isSlideRelatedPlugin(plugin) &&
      !isEmbedHiddenChinesePrimaryDeckTemplate(
        { id: plugin.id, contentLocale: readOdContentLocale(plugin.manifest?.od) },
        branding,
      ),
  );
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
      return (
        isSlideRelatedDesignTemplate(skill) &&
        !isEmbedHiddenChinesePrimaryDeckTemplate(skill, branding)
      );
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
