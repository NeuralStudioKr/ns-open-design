import { defaultScenarioPluginIdForKind, type InstalledPluginRecord } from "@open-design/contracts";
import { COMPACT_DECK_SLIDE_COUNT_GUIDANCE } from "../runtime/deckGuidance";
import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";
import type { TeamverCanvasLaunchHandoff } from "./canvasLaunchHandoff";
import { localizePluginTitle } from "../components/plugins-home/localization";

const MAX_CANVAS_PROJECT_NAME_LENGTH = 80;

/** Display name for a new Design project created from Canvas → slides. */
export function canvasCreateSlidesProjectName(
  handoff: Pick<TeamverCanvasLaunchHandoff, "title" | "threadTitle">,
): string | null {
  for (const candidate of [handoff.title, handoff.threadTitle]) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    const singleLine = trimmed.replace(/\s+/g, " ");
    if (!singleLine) continue;
    if (singleLine.length <= MAX_CANVAS_PROJECT_NAME_LENGTH) return singleLine;
    return `${singleLine.slice(0, MAX_CANVAS_PROJECT_NAME_LENGTH - 1).trimEnd()}…`;
  }
  return null;
}
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
  "`<artifact type=\"deck\">` with one filled `<section class=\"slide\">` per requested slide count " +
  `(see Plugin inputs slideCount / user brief; ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE}), ` +
  "body-first inline styles, and no `<head>`, nav, or print scaffolding. " +
  "Do not finish with prose only and do not stop before `</artifact>`.";

/** User-visible first message for Canvas / Drive → create-slides. */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "캔버스 내용을 바탕으로 슬라이드 덱을 만들어줘.";

/** Infer deck slide count from Canvas outline meta (sections beat heading count). */
export function inferCanvasDeckSlideCount(
  handoff: Pick<TeamverCanvasLaunchHandoff, "sectionCount" | "headings">,
): number | null {
  const sections =
    handoff.sectionCount != null && handoff.sectionCount > 0
      ? Math.min(Math.floor(handoff.sectionCount), 50)
      : null;
  const headingCount = (handoff.headings ?? []).map((item) => item.trim()).filter(Boolean).length;
  const fromHeadings = headingCount > 0 ? Math.min(headingCount, 50) : null;
  const count = sections ?? fromHeadings;
  return count != null && count >= 1 ? count : null;
}

export function formatCanvasDeckSlideCountInput(count: number): string {
  return `${count} slides`;
}

export function canvasCreateSlidesProjectMetadata(
  handoff?: Pick<TeamverCanvasLaunchHandoff, "sectionCount" | "headings"> | null,
): { kind: "deck"; skipDiscoveryBrief: true; slideCount?: string } {
  const count = handoff ? inferCanvasDeckSlideCount(handoff) : null;
  return {
    kind: "deck",
    skipDiscoveryBrief: true,
    ...(count != null ? { slideCount: formatCanvasDeckSlideCountInput(count) } : {}),
  };
}

export function canvasCreateSlidesRunPrompt(
  templateTitle?: string | null,
  sourceBrief?: string | null,
  handoff?: Pick<TeamverCanvasLaunchHandoff, "sectionCount" | "headings"> | null,
): string {
  const title = templateTitle?.trim();
  const templateHint = title ? `\nSelected slide template/style: ${title}.` : "";
  const brief = compactCanvasBriefValue(sourceBrief ?? "", 900);
  const sourceHint = brief ? `\n\n[Source brief]\n${brief}` : "";
  const slideCount = handoff ? inferCanvasDeckSlideCount(handoff) : null;
  const countHint =
    slideCount != null
      ? `\nTarget slide count from canvas structure: ${slideCount} slides.`
      : "";
  return `${CANVAS_CREATE_SLIDES_PROMPT}\n\n[Deliverable instruction]\n${CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION}${templateHint}${countHint}${sourceHint}`;
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

function compactCanvasBriefValue(value: string, max = 220): string {
  const compact = value
    .replace(/<\s*(script|style|tools|tool|invoke|thinking|analysis|todo)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\/?\s*(script|style|tools|tool|invoke|thinking|analysis|todo)[^>]*>/gi, " ")
    .replace(/<[^>\n]{1,120}>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > max ? `${compact.slice(0, max - 1).trimEnd()}…` : compact;
}

export function canvasCreateSlidesSourceBrief(
  handoff: Pick<
    TeamverCanvasLaunchHandoff,
    "title" | "threadTitle" | "preview" | "sectionCount" | "headings"
  >,
): string | null {
  const lines: string[] = [];
  const title = handoff.title?.trim() || handoff.threadTitle?.trim();
  if (title) lines.push(`Canvas title: ${compactCanvasBriefValue(title, 120)}`);
  if (handoff.sectionCount != null && handoff.sectionCount > 0) {
    lines.push(`Canvas sections: ${Math.min(Math.floor(handoff.sectionCount), 999)}`);
  }
  const headings = (handoff.headings ?? []).map((item) => compactCanvasBriefValue(item, 80)).filter(Boolean);
  if (headings.length > 0) lines.push(`Visible headings: ${headings.slice(0, 6).join(" / ")}`);
  const preview = handoff.preview?.trim();
  if (preview) lines.push(`Source preview: ${compactCanvasBriefValue(preview, 320)}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Plugin inputs for example-simple-deck on create-slides one-confirm. */
export function canvasCreateSlidesPluginInputs(
  topicHint?: string | null,
  templateTitle?: string | null,
  sourceBrief?: string | null,
  handoff?: Pick<TeamverCanvasLaunchHandoff, "sectionCount" | "headings"> | null,
): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the attached canvas document";
  const brief = sourceBrief?.trim();
  const slideCount = handoff ? inferCanvasDeckSlideCount(handoff) : null;
  return {
    deckType: "presentation from canvas",
    topic,
    audience: "stakeholders",
    speakerNotes: "no speaker notes",
    designSystem: (templateTitle ?? "").trim() || "the active project design system",
    ...(brief ? { sourceBrief: brief } : {}),
    ...(slideCount != null ? { slideCount: formatCanvasDeckSlideCountInput(slideCount) } : {}),
    sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  };
}
