import { defaultScenarioPluginIdForKind } from "@open-design/contracts";
import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";

/** Deck scenario for Canvas / Drive → create-slides (not od-default). */
export const CANVAS_CREATE_SLIDES_PLUGIN_ID =
  defaultScenarioPluginIdForKind("deck") ?? "example-simple-deck";

/**
 * Slide-generation prompt paired with Canvas → Design handoff (`teamverDriveIntent=create-slides`).
 * The attached HTML is a **source document**, not the deliverable — the agent must build a new
 * multi-slide deck (simple-deck framework), not leave/copy the source HTML as the project output.
 */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "Build a new multi-slide presentation deck from the attached canvas HTML source. " +
  "The attachment is research/source material only — do NOT use that HTML file as the deliverable, " +
  "and do not merely rename or lightly restyle it. Create a proper deck using the simple-deck " +
  "framework (1920×1080 slides with section.slide structure, nav, and print). " +
  "Preserve the source structure, headings, callouts, tables, images, and smart blocks " +
  "(FAQ/KPI/timeline); prefer clear slide sectioning over literal page layout.";

export function isCanvasSlideOneConfirmLaunch(
  intent: TeamverDriveLaunchIntent | null,
  asset: TeamverDriveImportAsset | null,
): asset is TeamverDriveImportAsset {
  return intent === "create-slides" && asset != null;
}

/** Plugin inputs for example-simple-deck on create-slides one-confirm. */
export function canvasCreateSlidesPluginInputs(topicHint?: string | null): Record<string, unknown> {
  const topic = (topicHint ?? "").trim() || "the attached canvas document";
  return {
    deckType: "presentation from canvas",
    topic,
    audience: "stakeholders",
    slideCount: "8-15 pages",
    speakerNotes: "no speaker notes",
    designSystem: "the active project design system",
  };
}
