import { formatTeamverEmbedAuthRequiredMessage } from "./teamverBffAuthError";

/** Drive browse/import empty-state copy when BFF auth requires re-login. */
export function formatTeamverDriveBrowseReloginMessage(options?: {
  userMismatch?: boolean;
}): string {
  if (options?.userMismatch) {
    return (
      "Teamver Main 로그인 계정과 Design 세션 계정이 달라 드라이브를 열 수 없습니다. "
      + "같은 계정으로 Teamver에 다시 로그인해 주세요."
    );
  }
  return formatTeamverEmbedAuthRequiredMessage(
    "Drive 세션이 만료되어 드라이브를 불러올 수 없습니다.",
    "드라이브를 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  );
}

/** Publish panel hint when target hydration requires re-login. */
export function formatTeamverDrivePanelReloginMessage(options?: {
  userMismatch?: boolean;
}): string {
  if (options?.userMismatch) {
    return (
      "Teamver Main 로그인 계정과 Design 세션 계정이 달라 Drive에 연결할 수 없습니다. "
      + "같은 계정으로 Teamver에 다시 로그인한 뒤 시도하세요."
    );
  }
  return formatTeamverEmbedAuthRequiredMessage(
    "Drive 세션이 만료되어 드라이브를 불러올 수 없습니다. Teamver에 다시 로그인한 뒤 시도하세요.",
    "드라이브를 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  );
}
