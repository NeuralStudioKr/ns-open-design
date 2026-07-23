import { defaultScenarioPluginIdForKind, type InstalledPluginRecord } from "@open-design/contracts";
import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";
import { localizePluginTitle } from "../components/plugins-home/localization";

/** Deck scenario for Canvas / Drive → create-slides (not od-default). */
export const CANVAS_CREATE_SLIDES_PLUGIN_ID =
  defaultScenarioPluginIdForKind("deck") ?? "example-simple-deck";

/**
 * Slide-generation prompt paired with Canvas → Design handoff (`teamverDriveIntent=create-slides`).
 * The attached HTML is a **source document**, not the deliverable — the agent must build a new
 * compact API deck artifact, not leave/copy the source HTML as the project output.
 */
export const CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION =
  "Build a new presentation deck from the attached canvas HTML source. " +
  "The attachment is research/source material only — do NOT use that HTML file as the deliverable, " +
  "and do not merely rename or lightly restyle it. " +
  "Preserve the source structure, headings, callouts, tables, images, and smart blocks " +
  "(FAQ/KPI/timeline); prefer clear slide sectioning over literal page layout. " +
  "Emit ONE complete Teamver compact deck in this same response: " +
  "`<artifact type=\"deck\">` with 6–8 filled `<section class=\"slide\">` blocks, " +
  "body-first inline styles, and no `<head>`, nav, or print scaffolding. " +
  "Do not finish with prose only and do not stop before `</artifact>`.";

/** User-visible first message for Canvas / Drive → create-slides. */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "캔버스 내용을 바탕으로 슬라이드 덱을 만들어줘.";

export function canvasCreateSlidesRunPrompt(templateTitle?: string | null): string {
  const title = templateTitle?.trim();
  const templateHint = title ? `\nSelected slide template/style: ${title}.` : "";
  return `${CANVAS_CREATE_SLIDES_PROMPT}\n\n[Deliverable instruction]\n${CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION}${templateHint}`;
}

/** Per-turn meta so API/daemon runs compose the selected deck template into the system prompt. */
export function canvasCreateSlidesTurnMeta(
  templateId: string,
  options?: {
    designSystemId?: string | null;
    mergeContext?: {
      pluginIds?: string[];
      skillIds?: string[];
    };
  },
): {
  skillIds: string[];
  designSystemId?: string | null;
  context: { pluginIds: string[]; skillIds: string[] };
} {
  const id = templateId.trim();
  const priorPluginIds = options?.mergeContext?.pluginIds ?? [];
  const priorSkillIds = options?.mergeContext?.skillIds ?? [];
  return {
    skillIds: id ? [id] : [],
    ...(options?.designSystemId != null ? { designSystemId: options.designSystemId } : {}),
    context: {
      pluginIds: id ? [id, ...priorPluginIds.filter((pluginId) => pluginId !== id)] : priorPluginIds,
      skillIds: id ? [id, ...priorSkillIds.filter((skillId) => skillId !== id)] : priorSkillIds,
    },
  };
}

export type TeamverCanvasSlideTemplateOption = {
  id: string;
  title: string;
};

export function isCanvasSlideOneConfirmLaunch(
  intent: TeamverDriveLaunchIntent | null,
  asset: TeamverDriveImportAsset | null,
): asset is TeamverDriveImportAsset {
  return intent === "create-slides" && asset != null;
}

export function canvasSlideTemplateOptions(
  plugins: readonly InstalledPluginRecord[],
  locale: string,
): TeamverCanvasSlideTemplateOption[] {
  const seen = new Set<string>();
  const options: TeamverCanvasSlideTemplateOption[] = [];
  for (const plugin of plugins) {
    const id = plugin.id?.trim();
    if (!id || seen.has(id)) continue;
    if (plugin.manifest?.od?.mode !== "deck") continue;
    seen.add(id);
    options.push({ id, title: localizePluginTitle(locale, plugin) || id });
  }
  if (!seen.has(CANVAS_CREATE_SLIDES_PLUGIN_ID)) {
    options.unshift({ id: CANVAS_CREATE_SLIDES_PLUGIN_ID, title: "기본 슬라이드 템플릿" });
  }
  return options;
}

/** Plugin inputs for example-simple-deck on create-slides one-confirm. */
export function canvasCreateSlidesPluginInputs(
  topicHint?: string | null,
  templateTitle?: string | null,
): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the attached canvas document";
  return {
    deckType: "presentation from canvas",
    topic,
    audience: "stakeholders",
    slideCount: "6-8 pages",
    speakerNotes: "no speaker notes",
    designSystem: (templateTitle ?? "").trim() || "the active project design system",
    sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  };
}
