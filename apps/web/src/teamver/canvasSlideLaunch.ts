import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";

/** Slide-generation prompt paired with Canvas → Design handoff (`teamverDriveIntent=create-slides`). */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "Create a polished presentation from the attached canvas HTML. Preserve its structure, headings, callouts, tables, images, and smart blocks (FAQ/KPI/timeline). Prefer clear slide sectioning over literal page layout.";

export function isCanvasSlideOneConfirmLaunch(
  intent: TeamverDriveLaunchIntent | null,
  asset: TeamverDriveImportAsset | null,
): asset is TeamverDriveImportAsset {
  return intent === "create-slides" && asset != null;
}
