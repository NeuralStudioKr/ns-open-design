import { useTeamverSession } from "../teamver/useTeamverSession";
import { getDesignBffClient } from "../teamver/designBffClient";
import { resolveTeamverLoginUrl } from "../teamver/designApiBase";

type Props = {
  teamverEmbed: boolean;
};

export function TeamverSessionBanner({ teamverEmbed }: Props) {
  const session = useTeamverSession(teamverEmbed);
  const client = getDesignBffClient();

  if (!teamverEmbed || !client) return null;

  if (session.loading) {
    return (
      <div className="teamver-session-banner" data-state="loading">
        Teamver…
      </div>
    );
  }

  if (session.authenticated && session.userLabel) {
    return (
      <div className="teamver-session-banner" data-state="ok" title={session.defaultWorkspaceId ?? undefined}>
        {session.userLabel}
      </div>
    );
  }

  return (
    <div className="teamver-session-banner" data-state="warn">
      <a href={resolveTeamverLoginUrl()} target="_blank" rel="noreferrer">
        Teamver 로그인
      </a>
    </div>
  );
}
