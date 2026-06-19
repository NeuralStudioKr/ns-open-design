type AnalyticsTrack = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export type TeamverDriveImportModalSurfaceViewProps = {
  page_name: "chat_panel";
  area: "drive_import_modal";
};

export type TeamverDriveImportPickClickProps = {
  page_name: "chat_panel";
  area: "drive_import_modal";
  element: "drive_import_pick";
  asset_count: number;
};

export function trackTeamverDriveImportModalSurfaceView(
  track: AnalyticsTrack,
  props: TeamverDriveImportModalSurfaceViewProps,
): void {
  track("surface_view", props);
}

export function trackTeamverDriveImportPickClick(
  track: AnalyticsTrack,
  props: TeamverDriveImportPickClickProps,
): void {
  track("ui_click", props);
}
