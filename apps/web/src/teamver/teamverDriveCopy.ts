/** User-facing Drive scope labels (import/publish/picker modals). */
export const TEAMVER_PERSONAL_DRIVE_LABEL = "개인 드라이브";
export const TEAMVER_PERSONAL_DRIVE_ROOT_DESCRIPTION = "개인 드라이브 루트";
export const TEAMVER_PERSONAL_DRIVE_FOLDER_DESCRIPTION = "개인 드라이브 폴더";

/** Legacy Main BE / folder-tree ROOT display names — match only, do not show in UI. */
export const LEGACY_PERSONAL_DRIVE_ROOT_NAMES = ["개인 드라이브", "내 드라이브"] as const;

export function isLegacyPersonalDriveRootFolderName(name: string): boolean {
  const trimmed = name.trim();
  return LEGACY_PERSONAL_DRIVE_ROOT_NAMES.some((legacy) => legacy === trimmed);
}
