import { Icon } from "./Icon";
import { useTeamverT } from "../teamver/branding/useTeamverT";
import { resolveTeamverLoginUrl, resolveTeamverMainOrigin } from "../teamver/designApiBase";
import { prepareDesignAuthSessionReload } from "../teamver/designBffClient";
import { TeamverAvatarGlyph } from "../teamver/components/TeamverAvatarGlyph";
import { TeamverWorkspaceSwitcher } from "../teamver/components/TeamverWorkspaceSwitcher";
import { useTeamverEmbed } from "../teamver/useTeamverEmbed";

type Props = {
  teamverEmbed: boolean;
};

export function TeamverSessionBanner({ teamverEmbed }: Props) {
  const t = useTeamverT();
  const embed = useTeamverEmbed(teamverEmbed);

  if (!teamverEmbed) return null;

  if (embed.loading) {
    return (
      <div className="teamver-embed-bar" data-state="loading" data-testid="teamver-embed-bar">
        <span className="teamver-embed-bar__status">{t("teamver.embed.sessionLoading")}</span>
      </div>
    );
  }

  // BFF transient failure can keep `authenticated=true` while session probe lost
  // contact (`error: "session_unreachable"`) — surface a retry chip without
  // collapsing the bar so workspace switch + account links stay reachable.
  const sessionUnreachable = embed.error === "session_unreachable";
  const handleRetrySession = () => {
    void embed.refresh({ force: true });
  };

  if (embed.authenticated) {
    const barState = !embed.designAppEnabled || sessionUnreachable ? "warn" : "ok";
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
              {t("teamver.embed.designDisabled")}
            </span>
          ) : null}
          {sessionUnreachable ? (
            <span
              className="teamver-embed-bar__warn"
              data-testid="teamver-embed-session-warn"
            >
              세션 확인 실패
            </span>
          ) : null}
        </div>
        <div className="teamver-embed-bar__group teamver-embed-bar__group--account">
          {sessionUnreachable ? (
            <button
              type="button"
              className="teamver-embed-bar__retry"
              data-testid="teamver-embed-session-retry"
              disabled={embed.loading}
              onClick={handleRetrySession}
            >
              세션 다시 확인
            </button>
          ) : null}
          <a
            className="teamver-embed-bar__main-link teamver-embed-bar__teamver-app"
            href={resolveTeamverMainOrigin()}
            title={t("teamver.embed.teamverAppTitle")}
            data-testid="teamver-embed-main-link"
          >
            <Icon name="external-link" size={14} className="teamver-embed-bar__main-link-icon" />
            <span className="teamver-embed-bar__main-link-label">{t("teamver.embed.teamverApp")}</span>
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
      <a
        className="teamver-embed-bar__signin"
        href={resolveTeamverLoginUrl()}
        onClick={() => prepareDesignAuthSessionReload()}
      >
        {t("teamver.embed.signIn")}
      </a>
      {sessionUnreachable ? (
        <button
          type="button"
          className="teamver-embed-bar__retry"
          data-testid="teamver-embed-session-retry"
          disabled={embed.loading}
          onClick={handleRetrySession}
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
