import type { InstalledPluginRecord, SkillSummary } from "@open-design/contracts";

import {
  localizePluginDescription,
  localizePluginTitle,
} from "../../components/plugins-home/localization";
import { localizeSkillDescription, localizeSkillName } from "../../i18n/content";
import type { Locale } from "../../i18n/types";
import { applyTeamverBrandToLocalizedText } from "../locales/embedOverrides";

export const TEAMVER_CATALOG_BRAND = "teamver Slide";

/** Catalog entries that must not appear in Teamver embed toolbox surfaces. */
const HIDDEN_TOOLBOX_PLUGIN_IDS = new Set([
  "example-open-design-landing-deck",
  "example-open-design-landing",
]);

const HIDDEN_TOOLBOX_SKILL_IDS = new Set([
  "open-design-landing-deck",
  "open-design-landing",
]);

/**
 * Official html-ppt meta skill (`plugins/_official/examples/html-ppt`).
 * It is a prompt/SKILL scaffold, not a visual deck template. Match the last
 * path segment only so child templates (`example-html-ppt-zhangzara-*`) stay
 * visible.
 */
const HIDDEN_PROMPT_SCAFFOLD_RESOURCE_IDS = new Set(["example-html-ppt", "html-ppt"]);

export function isTeamverHiddenPromptScaffoldResourceId(
  id: string | null | undefined,
): boolean {
  const last =
    String(id ?? "")
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.trim()
      .toLowerCase() ?? "";
  return HIDDEN_PROMPT_SCAFFOLD_RESOURCE_IDS.has(last);
}

function isExactHtmlPptScaffoldTitle(title: string | null | undefined): boolean {
  return title?.trim().replace(/\s+/g, " ").toLowerCase() === "html ppt";
}

const OPEN_SLIDE_LABEL_RE = /Open[- ]?Slide/gi;

/** OD product/skill slugs — not repo paths like `nexu-io/open-design` or `ns-open-design`. */
const OPEN_DESIGN_PRODUCT_SLUG_RE =
  /\b(?:example-)?open-design(?:-landing(?:-deck)?|-deck)\b/i;

export function isOpenDesignUpstreamBranding(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\bopen\s+design\b/i.test(trimmed)) return true;
  return OPEN_DESIGN_PRODUCT_SLUG_RE.test(trimmed);
}

export function isOpenDesignBrandedToolboxResource(values: string[], id?: string): boolean {
  if (id) {
    if (HIDDEN_TOOLBOX_PLUGIN_IDS.has(id) || HIDDEN_TOOLBOX_SKILL_IDS.has(id)) {
      return true;
    }
  }
  return values.some((value) => isOpenDesignUpstreamBranding(value));
}

export function applyTeamverCatalogDisplayText(
  text: string,
  brand = TEAMVER_CATALOG_BRAND,
): string {
  const branded = applyTeamverBrandToLocalizedText(text, brand);
  const segments = branded.split(/(`[^`]*`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return segment;
      }
      return segment.replace(OPEN_SLIDE_LABEL_RE, brand);
    })
    .join("");
}

export function shouldHideTeamverToolboxPlugin(
  plugin: InstalledPluginRecord,
  locale: Locale,
): boolean {
  if (
    isTeamverHiddenPromptScaffoldResourceId(plugin.id) ||
    isTeamverHiddenPromptScaffoldResourceId(plugin.manifest?.name)
  ) {
    return true;
  }
  const title = localizePluginTitle(locale, plugin);
  if (isExactHtmlPptScaffoldTitle(title) || isExactHtmlPptScaffoldTitle(plugin.title)) {
    return true;
  }
  const subtitle = localizePluginDescription(locale, plugin) || plugin.id;
  return isOpenDesignBrandedToolboxResource(
    [
      plugin.id,
      plugin.title,
      title,
      subtitle,
      plugin.manifest?.name ?? "",
      plugin.manifest?.description ?? "",
      ...(plugin.manifest?.tags ?? []),
    ],
    plugin.id,
  );
}

export function shouldHideTeamverToolboxSkill(
  skill: SkillSummary,
  locale: Locale,
): boolean {
  if (
    isTeamverHiddenPromptScaffoldResourceId(skill.id) ||
    isTeamverHiddenPromptScaffoldResourceId(skill.name)
  ) {
    return true;
  }
  const title = localizeSkillName(locale, skill);
  if (isExactHtmlPptScaffoldTitle(title) || isExactHtmlPptScaffoldTitle(skill.name)) {
    return true;
  }
  const subtitle = localizeSkillDescription(locale, skill);
  return isOpenDesignBrandedToolboxResource(
    [skill.id, skill.name, title, subtitle],
    skill.id,
  );
}

export function teamverToolboxPluginTitle(
  locale: Locale,
  plugin: InstalledPluginRecord,
): string {
  return applyTeamverCatalogDisplayText(localizePluginTitle(locale, plugin));
}

export function teamverToolboxPluginDescription(
  locale: Locale,
  plugin: InstalledPluginRecord,
): string {
  const description = localizePluginDescription(locale, plugin) || plugin.manifest?.description || "";
  return description ? applyTeamverCatalogDisplayText(description) : "";
}

export function teamverToolboxSkillTitle(locale: Locale, skill: SkillSummary): string {
  return applyTeamverCatalogDisplayText(localizeSkillName(locale, skill));
}

export function teamverToolboxSkillDescription(
  locale: Locale,
  skill: SkillSummary,
): string {
  const description = localizeSkillDescription(locale, skill);
  return description ? applyTeamverCatalogDisplayText(description) : "";
}
