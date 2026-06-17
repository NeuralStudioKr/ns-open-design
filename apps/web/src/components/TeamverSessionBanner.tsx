import { resolveTeamverLoginUrl } from "../teamver/designApiBase";
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
        <span className="teamver-embed-bar__status">Teamver…</span>
      </div>
    );
  }

  if (embed.authenticated) {
    return (
      <div className="teamver-embed-bar" data-state="ok" data-testid="teamver-embed-bar">
        <TeamverWorkspaceSwitcher
          workspaces={embed.workspaces}
          activeWorkspaceId={embed.activeWorkspaceId}
          onSwitch={embed.switchWorkspace}
        />
        {embed.userLabel ? (
          <span className="teamver-embed-bar__user" title={embed.userId ?? undefined}>
            {embed.userLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="teamver-embed-bar" data-state="warn" data-testid="teamver-embed-bar">
      <a href={resolveTeamverLoginUrl()}>Teamver 로그인</a>
    </div>
  );
}
