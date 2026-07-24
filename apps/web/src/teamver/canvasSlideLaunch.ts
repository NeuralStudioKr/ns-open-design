import { defaultScenarioPluginIdForKind, type InstalledPluginRecord } from "@open-design/contracts";
import { COMPACT_DECK_SLIDE_COUNT_GUIDANCE } from "../runtime/deckGuidance";
import { listPluginsPage } from "../state/projects";
import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";
import type { TeamverCanvasLaunchHandoff } from "./canvasLaunchHandoff";
import { localizePluginTitle } from "../components/plugins-home/localization";

/** Deck scenario for Canvas / Drive → create-slides (not od-default). */
export const CANVAS_CREATE_SLIDES_PLUGIN_ID =
  defaultScenarioPluginIdForKind("deck") ?? "example-simple-deck";

/**
 * Slide-generation prompt paired with Canvas → Design handoff (`teamverDriveIntent=create-slides`).
 * The attached file is a **source document**, not the deliverable — the agent must build a new
 * compact API deck artifact, not leave/copy the source HTML as the project output.
 */
export const CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION =
  "Build a new presentation deck from the attached source material. " +
  "The attachment may be a Canvas HTML export or a Drive file; treat it as research/source material only. " +
  "Do NOT use the source file itself as the deliverable, " +
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
  "첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.";

export function canvasCreateSlidesRunPrompt(
  templateTitle?: string | null,
  sourceBrief?: string | null,
): string {
  const title = templateTitle?.trim();
  const templateHint = title ? `\nSelected slide template/style: ${title}.` : "";
  const brief = compactCanvasBriefValue(sourceBrief ?? "", 900);
  const sourceHint = brief ? `\n\n[Source brief]\n${brief}` : "";
  return `${CANVAS_CREATE_SLIDES_PROMPT}\n\n[Deliverable instruction]\n${CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION}${templateHint}${sourceHint}`;
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

/**
 * Slide-template option shown in the Canvas → Design one-confirm picker.
 *
 * `record` carries the full `InstalledPluginRecord` when available so the
 * picker can render the plugin's live preview / pre-baked hover-pan clip
 * (see `PluginCard layout="gallery"` in home). It is optional so:
 *   - the always-present "기본 슬라이드 템플릿" fallback still works when
 *     no matching plugin has been fetched yet (record: null)
 *   - external callers that only need `{id, title}` (e.g. run-prompt
 *     composition) keep working unchanged.
 */
export type TeamverCanvasSlideTemplateOption = {
  id: string;
  title: string;
  record?: InstalledPluginRecord | null;
};

export function isCanvasSlideOneConfirmLaunch(
  intent: TeamverDriveLaunchIntent | null,
  asset: TeamverDriveImportAsset | null,
): asset is TeamverDriveImportAsset {
  return intent === "create-slides" && asset != null;
}

/**
 * Deck-template plugin list cached in-memory so re-opening the Canvas / Drive
 * → Design launch modal (or bouncing between Home and a project) does not
 * re-hit `GET /api/plugins?mode=deck` every time. The list is trivially
 * idempotent on the daemon side, and the modal never survives longer than
 * a project run, so a short TTL is enough: fresh enough to notice newly
 * installed community decks, cheap enough that repeat opens are instant.
 *
 * Callers that need bypass-the-cache semantics (e.g. after a publish flow
 * that installs a new plugin) can pass `{ force: true }`.
 */
const DECK_TEMPLATE_CACHE_TTL_MS = 60_000;
const DECK_TEMPLATE_CACHE_LIMIT = 24;

type DeckTemplateCacheEntry = {
  fetchedAt: number;
  plugins: readonly InstalledPluginRecord[];
};

let deckTemplateCache: DeckTemplateCacheEntry | null = null;
let deckTemplateInflight: Promise<readonly InstalledPluginRecord[]> | null = null;

/**
 * Fetches (or reuses) the deck-template plugin list used by the Canvas →
 * Design slide-template picker. Multiple concurrent callers share the same
 * in-flight promise so opening the modal 3 times in a row still fires one
 * request.
 */
export async function fetchCanvasSlideTemplatePlugins(options?: {
  force?: boolean;
}): Promise<readonly InstalledPluginRecord[]> {
  const now = Date.now();
  if (
    !options?.force
    && deckTemplateCache
    && now - deckTemplateCache.fetchedAt < DECK_TEMPLATE_CACHE_TTL_MS
  ) {
    return deckTemplateCache.plugins;
  }
  if (deckTemplateInflight) return deckTemplateInflight;
  deckTemplateInflight = (async () => {
    try {
      const page = await listPluginsPage({
        mode: "deck",
        limit: DECK_TEMPLATE_CACHE_LIMIT,
      });
      deckTemplateCache = { fetchedAt: Date.now(), plugins: page.plugins };
      return page.plugins;
    } catch {
      // `listPluginsPage` already swallows fetch errors and returns an empty
      // page; guard anyway so the picker keeps working with just the
      // built-in "기본 슬라이드 템플릿" fallback.
      deckTemplateCache = { fetchedAt: Date.now(), plugins: [] };
      return [];
    } finally {
      deckTemplateInflight = null;
    }
  })();
  return deckTemplateInflight;
}

/** Test-only reset for the deck-template plugin cache. */
export function __resetCanvasSlideTemplatePluginsCacheForTests(): void {
  deckTemplateCache = null;
  deckTemplateInflight = null;
}

/**
 * Resolve the effective slide-template selection for the Canvas → Design
 * launch flow. Falls through the same 3-level ladder the modal and composer
 * previously duplicated:
 *   1. explicit templateId if it maps to a visible option
 *   2. first available option (already includes the "기본 슬라이드 템플릿"
 *      fallback which `canvasSlideTemplateOptions` always prepends)
 *   3. hard-coded default (empty options list — should never happen in
 *      practice because `canvasSlideTemplateOptions` always yields ≥ 1)
 *
 * Kept as a plain function (not a hook) so HomeView / ChatComposer can call
 * it from useMemo without pulling in extra React state.
 */
export function resolveCanvasSlideTemplate(
  options: readonly TeamverCanvasSlideTemplateOption[],
  templateId: string,
): TeamverCanvasSlideTemplateOption {
  const explicit = options.find((option) => option.id === templateId);
  if (explicit) return explicit;
  const first = options[0];
  if (first) return first;
  return { id: CANVAS_CREATE_SLIDES_PLUGIN_ID, title: "기본 슬라이드 템플릿", record: null };
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
    // Attach the record so the picker can render the plugin's example.html
    // preview / pre-baked hover-pan clip (visual template selection, not a
    // bare title dropdown).
    options.push({ id, title: localizePluginTitle(locale, plugin) || id, record: plugin });
  }
  if (!seen.has(CANVAS_CREATE_SLIDES_PLUGIN_ID)) {
    // Default option never guarantees a preview — it renders a static "기본"
    // tile in the picker. If the deck plugin list happens to include the
    // simple-deck default we prefer that (with its preview) above.
    options.unshift({ id: CANVAS_CREATE_SLIDES_PLUGIN_ID, title: "기본 슬라이드 템플릿", record: null });
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

export function driveCreateSlidesSourceBrief(
  asset: Pick<TeamverDriveImportAsset, "assetId" | "filename" | "mimeType">,
): string | null {
  const lines: string[] = [];
  const filename = asset.filename?.trim();
  if (filename) lines.push(`Drive source file: ${compactCanvasBriefValue(filename, 160)}`);
  const mimeType = asset.mimeType?.trim();
  if (mimeType) lines.push(`Drive source MIME: ${compactCanvasBriefValue(mimeType, 120)}`);
  const assetId = asset.assetId?.trim();
  if (assetId) lines.push(`Drive asset id: ${compactCanvasBriefValue(assetId, 120)}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Plugin inputs for example-simple-deck on create-slides one-confirm. */
export function canvasCreateSlidesPluginInputs(
  topicHint?: string | null,
  templateTitle?: string | null,
  sourceBrief?: string | null,
): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the attached source document";
  const brief = sourceBrief?.trim();
  return {
    deckType: "presentation from source material",
    topic,
    audience: "stakeholders",
    speakerNotes: "no speaker notes",
    designSystem: (templateTitle ?? "").trim() || "the active project design system",
    ...(brief ? { sourceBrief: brief } : {}),
    sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  };
}
