import { Icon } from "./Icon";
import { resolveTeamverLoginUrl, resolveTeamverMainOrigin } from "../teamver/designApiBase";
import { TeamverAvatarGlyph } from "../teamver/components/TeamverAvatarGlyph";
import { TeamverWorkspaceSwitcher } from "../teamver/components/TeamverWorkspaceSwitcher";
import { useTeamverEmbed } from "../teamver/useTeamverEmbed";

type Props = {
  teamverEmbed: boolean;
};

export function TeamverSessionBanner({ teamverEmbed }: Props) {
  const embed = useTeamverEmbed(teamverEmbed);

  if (!teamverEmbed) return null;

  if (embed.loading) {
    return (
      <div className="teamver-embed-bar" data-state="loading" data-testid="teamver-embed-bar">
        <span className="teamver-embed-bar__status">Teamver 세션 확인 중…</span>
      </div>
    );
  }

  if (embed.authenticated) {
    const barState = embed.designAppEnabled ? "ok" : "warn";
    return (
      <div className="teamver-embed-bar" data-state={barState} data-testid="teamver-embed-bar">
        <div className="teamver-embed-bar__group teamver-embed-bar__group--workspace">
          <TeamverWorkspaceSwitcher
            workspaces={embed.workspaces}
            activeWorkspaceId={embed.activeWorkspaceId}
            onSwitch={embed.switchWorkspace}
          />
          {!embed.designAppEnabled ? (
            <span
              className="teamver-embed-bar__warn"
              title={embed.designDisabledReason ?? undefined}
              data-testid="teamver-embed-app-disabled"
            >
              Design 사용 불가
            </span>
          ) : null}
        </div>
        <div className="teamver-embed-bar__group teamver-embed-bar__group--account">
          <a
            className="teamver-embed-bar__main-link"
            href={resolveTeamverMainOrigin()}
            title="Teamver 메인 앱으로 이동"
            data-testid="teamver-embed-main-link"
          >
            <Icon name="home" size={15} className="teamver-embed-bar__main-link-icon" />
            <span className="teamver-embed-bar__main-link-label">Teamver 메인</span>
          </a>
          {embed.userLabel ? (
            <div
              className="teamver-embed-bar__user"
              title={embed.userId ?? embed.userLabel}
              data-testid="teamver-embed-user"
            >
              <TeamverAvatarGlyph
                imageUrl={embed.userImageUrl}
                label={embed.userLabel}
                size="sm"
                className="teamver-embed-bar__user-avatar"
              />
              <span className="teamver-embed-bar__user-name">{embed.userLabel}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="teamver-embed-bar" data-state="warn" data-testid="teamver-embed-bar">
      <a className="teamver-embed-bar__signin" href={resolveTeamverLoginUrl()}>
        Teamver 로그인
      </a>
    </div>
  );
}
