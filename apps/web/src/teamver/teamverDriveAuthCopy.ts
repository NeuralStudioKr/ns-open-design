import { formatTeamverEmbedAuthRequiredMessage } from "./teamverBffAuthError";

/** Drive browse/import empty-state copy when BFF auth requires re-login. */
export function formatTeamverDriveBrowseReloginMessage(): string {
  return formatTeamverEmbedAuthRequiredMessage(
    "Drive 세션이 만료되어 드라이브를 불러올 수 없습니다.",
    "드라이브를 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  );
}

/** Publish panel hint when target hydration requires re-login. */
export function formatTeamverDrivePanelReloginMessage(): string {
  return formatTeamverEmbedAuthRequiredMessage(
    "Drive 세션이 만료되어 드라이브를 불러올 수 없습니다. Teamver에 다시 로그인한 뒤 이 창을 열어 주세요.",
    "드라이브를 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  );
}
