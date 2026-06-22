import type { TeamverDriveImportAsset } from "./importDriveAssets";
import type { TeamverDriveLaunchIntent } from "./driveLaunchHandoff";

/** Slide-generation prompt paired with Canvas → Drive handoff (`teamverDriveIntent=create-slides`). */
export const CANVAS_CREATE_SLIDES_PROMPT =
  "Create a polished presentation from the attached canvas. Preserve its structure, key content, and visual assets.";

export function isCanvasSlideOneConfirmLaunch(
  intent: TeamverDriveLaunchIntent | null,
  asset: TeamverDriveImportAsset | null,
): asset is TeamverDriveImportAsset {
  return intent === "create-slides" && asset != null;
}
