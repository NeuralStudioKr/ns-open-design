import { defaultScenarioPluginIdForKind, DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID, type InstalledPluginRecord } from "@open-design/contracts";
import { COMPACT_DECK_SLIDE_COUNT_GUIDANCE } from "../runtime/deckGuidance";
import { listPluginsPage } from "../state/projects";
import { resolveSlideOnlyCreatePluginId } from "./branding/slideOnlyMvpPolicy";
import type { TeamverDriveImportAsset } from "./importDriveAssets";
import {
  readTeamverDriveLaunchHandoff,
  readTeamverDriveLaunchIntent,
  type TeamverDriveLaunchIntent,
} from "./driveLaunchHandoff";
import {
  readTeamverCanvasLaunchHandoff,
  type TeamverCanvasLaunchHandoff,
} from "./canvasLaunchHandoff";
import { localizePluginTitle } from "../components/plugins-home/localization";

/** Canvas / Drive → create-slides one-confirm source read from the URL. */
export type TeamverCreateSlidesLaunchSource =
  | { kind: "drive"; asset: TeamverDriveImportAsset }
  | { kind: "canvas"; handoff: TeamverCanvasLaunchHandoff };

/**
 * Read create-slides handoff without consuming URL params.
 * Workspace bootstrap often clears modal state while `allowed` stays true —
 * callers must re-read from the URL after workspace settle.
 */
export function readTeamverCreateSlidesLaunchFromUrl(): TeamverCreateSlidesLaunchSource | null {
  const canvasHandoff = readTeamverCanvasLaunchHandoff();
  if (canvasHandoff) return { kind: "canvas", handoff: canvasHandoff };
  if (readTeamverDriveLaunchIntent() !== "create-slides") return null;
  const asset = readTeamverDriveLaunchHandoff();
  if (!asset) return null;
  return { kind: "drive", asset };
}

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
  "The attachment may be a Canvas HTML export or a Drive file under `refs/...`; treat it as research/source material only. " +
  "Do NOT use the source file itself as the deliverable, " +
  "do not copy/rename/save the source HTML (or any near-copy of it) into the project root, " +
  "and do not merely lightly restyle the source page. " +
  "If you use the Write/Edit tool, the ONLY root HTML file you may create or overwrite is `deck.html` — " +
  "never Write `index.html`, `canvas.html`, or any other root HTML that mirrors a `refs/...` source basename. " +
  "The only HTML deliverable must be a rebuilt slide deck saved as `deck.html` " +
  "via exactly one `<artifact type=\"deck\" identifier=\"deck\">` (identifier MUST be `deck`). " +
  "Preserve the source structure, headings, callouts, tables, images, and smart blocks " +
  "(FAQ/KPI/timeline); prefer clear slide sectioning over literal page layout. " +
  "Emit ONE complete Teamver compact deck in this same response: " +
  "`<artifact type=\"deck\" identifier=\"deck\">` with one filled `<section class=\"slide\">` per requested slide count " +
  `(see Plugin inputs slideCount / user brief; ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE}), ` +
  "body-first inline styles, and no `<head>`, nav, custom slide script, or print scaffolding. " +
  "Each slide must be a fixed 1920×1080 canvas (`width:1920px;height:1080px;box-sizing:border-box;position:relative;overflow:hidden`) " +
  "so Teamver can scale the whole slide; do not size core typography or layout with viewport units that reflow by panel size. " +
  "Do not finish with prose only and do not stop before `</artifact>`.";

/** User-visible first message for Canvas / Drive → create-slides. */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.";

export type CanvasSlideAudience = "auto" | "internal" | "client" | "education" | "business";
export type CanvasSlideLength = "auto" | "short" | "standard" | "detailed";
export type CanvasSlideTransformMode = "presentation" | "faithful" | "summary";
export type CanvasSlideTone = "auto" | "professional" | "modern" | "friendly" | "impact";

export type CanvasSlideQuickSettings = {
  audience: CanvasSlideAudience;
  length: CanvasSlideLength;
  transformMode: CanvasSlideTransformMode;
  tone: CanvasSlideTone;
};

export const DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS: CanvasSlideQuickSettings = {
  audience: "auto",
  length: "auto",
  transformMode: "presentation",
  tone: "auto",
};

const QUICK_SETTING_PROMPT_LABELS = {
  audience: {
    auto: "Infer audience from the source",
    internal: "Internal team/report audience",
    client: "Client/proposal audience",
    education: "Education/training audience",
    business: "Business/investor audience",
  },
  length: {
    auto: "Infer slide count from the source",
    short: "Short deck",
    standard: "Standard deck",
    detailed: "Detailed deck",
  },
  transformMode: {
    presentation: "Rebuild as a presentation, not a literal page copy",
    faithful: "Stay close to the source structure",
    summary: "Summarize and prioritize key messages",
  },
  tone: {
    auto: "Infer tone from the source/template",
    professional: "Professional",
    modern: "Modern",
    friendly: "Friendly",
    impact: "Impact-focused",
  },
} as const;

function normalizeQuickSettingValue<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && allowed.includes(value) ? value : fallback;
}

export function normalizeCanvasSlideQuickSettings(
  settings?: Partial<CanvasSlideQuickSettings> | null,
): CanvasSlideQuickSettings {
  const raw = settings ?? {};
  return {
    audience: normalizeQuickSettingValue(
      raw.audience,
      ["auto", "internal", "client", "education", "business"],
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS.audience,
    ),
    length: normalizeQuickSettingValue(
      raw.length,
      ["auto", "short", "standard", "detailed"],
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS.length,
    ),
    transformMode: normalizeQuickSettingValue(
      raw.transformMode,
      ["presentation", "faithful", "summary"],
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS.transformMode,
    ),
    tone: normalizeQuickSettingValue(
      raw.tone,
      ["auto", "professional", "modern", "friendly", "impact"],
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS.tone,
    ),
  };
}

export function canvasSlideQuickSettingsInstruction(
  settings?: Partial<CanvasSlideQuickSettings> | null,
): string {
  const normalized = normalizeCanvasSlideQuickSettings(settings);
  return [
    `Audience: ${QUICK_SETTING_PROMPT_LABELS.audience[normalized.audience]}.`,
    `Length: ${QUICK_SETTING_PROMPT_LABELS.length[normalized.length]}.`,
    `Transform mode: ${QUICK_SETTING_PROMPT_LABELS.transformMode[normalized.transformMode]}.`,
    `Tone: ${QUICK_SETTING_PROMPT_LABELS.tone[normalized.tone]}.`,
  ].join("\n");
}

export function canvasCreateSlidesRunPrompt(
  templateTitle?: string | null,
  sourceBrief?: string | null,
  userInstruction?: string | null,
  quickSettings?: Partial<CanvasSlideQuickSettings> | null,
): string {
  const title = templateTitle?.trim();
  const isDefaultTemplate = !title || title === "기본 슬라이드 템플릿";
  // Weak inline hint for the default template (there is no explicit visual
  // spec to preserve). For a user-picked template we surface a dedicated
  // `[Selected slide template]` block so the model cannot bury it under the
  // deliverable / source brief scaffolding — this used to be a single line
  // and the model would ignore it whenever the source material did not
  // suggest the template's theme.
  const templateHint = isDefaultTemplate
    ? (title ? `\nSelected slide template/style: ${title}.` : "")
    : "";
  const templateBlock = !isDefaultTemplate && title
    ? [
      "\n\n[Selected slide template]",
      `The user picked "${title}" as the deck template. Match its visual identity — palette, typography, layout, and motif — as closely as the template specification in the system prompt allows.`,
      "If the source material's topic doesn't fit the template's theme (e.g. business content picked with a terminal template), restyle the content into this template's visual language anyway. Do NOT return an empty deck because of the mismatch; an imperfect visual match is better than no deck.",
    ].join("\n")
    : "";
  const brief = compactCanvasBriefValue(sourceBrief ?? "", 900);
  const sourceHint = brief ? `\n\n[Source brief]\n${brief}` : "";
  const user = compactCanvasBriefValue(userInstruction ?? "", 600);
  const userHint = user ? `\n\n[User instruction]\n${user}` : "";
  const quickHint = `\n\n[Quick settings]\n${canvasSlideQuickSettingsInstruction(quickSettings)}`;
  return `${CANVAS_CREATE_SLIDES_PROMPT}\n\n[Deliverable instruction]\n${CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION}${templateHint}${templateBlock}${quickHint}${sourceHint}${userHint}`;
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
  // Visual template stays in skillIds only. Scenario/applied plugins keep
  // context.pluginIds — injecting the template there shadows the scenario.
  // Always include the deck scenario plugin so BYOK/API composition can load
  // example-simple-deck as a secondary body when an explicit template wins.
  const priorPluginIds = (options?.mergeContext?.pluginIds ?? []).filter(
    (pluginId) => pluginId !== id && pluginId !== CANVAS_CREATE_SLIDES_PLUGIN_ID,
  );
  const priorSkillIds = options?.mergeContext?.skillIds ?? [];
  return {
    skillIds: id ? [id] : [],
    ...(options?.designSystemId != null ? { designSystemId: options.designSystemId } : {}),
    context: {
      pluginIds: [CANVAS_CREATE_SLIDES_PLUGIN_ID, ...priorPluginIds],
      skillIds: id ? [id, ...priorSkillIds.filter((skillId) => skillId !== id)] : priorSkillIds,
    },
  };
}

/**
 * Slide-only embed: keep project creation on the deck scenario plugin while
 * persisting the user's visual template choice in project metadata.
 */
export function buildSlideOnlyDeckTemplateCreateBinding(
  template: Pick<TeamverCanvasSlideTemplateOption, "id" | "title">,
  options: { slideOnlyMvp: boolean },
): {
  pluginId: string;
  projectMetadata: {
    kind: "deck";
    skipDiscoveryBrief: true;
    selectedDeckTemplateId?: string;
    selectedDeckTemplateTitle?: string;
  };
  pluginInputsPatch: Record<string, unknown>;
} {
  const explicitTemplateId =
    template.id.trim() && template.id !== CANVAS_CREATE_SLIDES_PLUGIN_ID
      ? template.id
      : null;
  const pluginId = options.slideOnlyMvp
    ? resolveSlideOnlyCreatePluginId(
        explicitTemplateId ? DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID : template.id,
        { slideOnlyMvp: true },
      ) ?? CANVAS_CREATE_SLIDES_PLUGIN_ID
    : template.id;
  return {
    pluginId,
    projectMetadata: {
      kind: "deck",
      skipDiscoveryBrief: true,
      ...(explicitTemplateId
        ? {
            selectedDeckTemplateId: explicitTemplateId,
            selectedDeckTemplateTitle: template.title,
          }
        : {}),
    },
    pluginInputsPatch: explicitTemplateId
      ? {
          designSystem: template.title,
          visualTemplate: template.title,
        }
      : {},
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
/** Hard stop so a buggy nextOffset cannot loop forever. 40 × 24 ≈ full catalog. */
const DECK_TEMPLATE_MAX_PAGES = 40;

type DeckTemplateCacheEntry = {
  fetchedAt: number;
  plugins: readonly InstalledPluginRecord[];
};

let deckTemplateCache: DeckTemplateCacheEntry | null = null;
let deckTemplateInflight: Promise<readonly InstalledPluginRecord[]> | null = null;

/**
 * Fetches (or reuses) the deck-template plugin list used by the Canvas →
 * Design slide-template picker. Pages through the catalog until `nextOffset`
 * is exhausted so the modal matches the root Community gallery (which loads
 * more than the first page of 24). Multiple concurrent callers share the same
 * in-flight promise so opening the modal 3 times in a row still fires one
 * walk.
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
    const all: InstalledPluginRecord[] = [];
    const seen = new Set<string>();
    try {
      let offset = 0;
      for (let pageNum = 0; pageNum < DECK_TEMPLATE_MAX_PAGES; pageNum += 1) {
        const page = await listPluginsPage({
          mode: "deck",
          limit: DECK_TEMPLATE_CACHE_LIMIT,
          ...(offset > 0 ? { offset } : {}),
        });
        for (const plugin of page.plugins) {
          const id = plugin.id?.trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          all.push(plugin);
        }
        // Client-side denylist / hidden filters can empty a server page while
        // nextOffset still advances. Keep walking so the modal matches Home's
        // load-more catalog instead of caching a truncated first page.
        if (page.nextOffset == null) break;
        if (page.nextOffset === offset) break;
        offset = page.nextOffset;
      }
      deckTemplateCache = { fetchedAt: Date.now(), plugins: all };
      return all;
    } catch {
      // Keep a partial walk if we already collected plugins; otherwise preserve
      // any warmer cache and only seed [] when nothing else is available.
      if (all.length > 0) {
        deckTemplateCache = { fetchedAt: Date.now(), plugins: all };
        return all;
      }
      if (!deckTemplateCache) {
        deckTemplateCache = { fetchedAt: Date.now(), plugins: [] };
      }
      return deckTemplateCache.plugins;
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
 * Synchronous read of a still-fresh deck-template cache entry.
 * Used by the launch-modal hook so the first paint can skip the
 * fallback-only → full-list flicker when a prior open (or home boot)
 * already warmed the TTL cache.
 */
export function peekCanvasSlideTemplatePlugins(): readonly InstalledPluginRecord[] | null {
  if (!deckTemplateCache) return null;
  if (Date.now() - deckTemplateCache.fetchedAt >= DECK_TEMPLATE_CACHE_TTL_MS) {
    return null;
  }
  return deckTemplateCache.plugins;
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
  // Preserve an explicit non-default pick while the catalog is still loading
  // or briefly shrinks. Falling back to options[0] ("기본 슬라이드 템플릿")
  // here + the picker auto-reset rewrote the user's selection before confirm.
  const trimmed = templateId.trim();
  if (trimmed && trimmed !== CANVAS_CREATE_SLIDES_PLUGIN_ID) {
    return { id: trimmed, title: trimmed, record: null };
  }
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
  userInstruction?: string | null,
  quickSettings?: Partial<CanvasSlideQuickSettings> | null,
): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the attached source document";
  const brief = sourceBrief?.trim();
  const user = userInstruction?.trim();
  const normalizedQuickSettings = normalizeCanvasSlideQuickSettings(quickSettings);
  const visualTemplate =
    (templateTitle ?? "").trim() || "기본 슬라이드 템플릿";
  return {
    deckType: "presentation from source material",
    topic,
    audience: "stakeholders",
    speakerNotes: "no speaker notes",
    // Keep designSystem for scenario schema compatibility, but point it at the
    // visual template title so Neutral Modern / Simple Deck cannot reclaim look.
    designSystem: visualTemplate,
    visualTemplate,
    ...(brief ? { sourceBrief: brief } : {}),
    ...(user ? { userInstruction: user } : {}),
    quickSettings: normalizedQuickSettings,
    quickSettingsInstruction: canvasSlideQuickSettingsInstruction(normalizedQuickSettings),
    sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  };
}
