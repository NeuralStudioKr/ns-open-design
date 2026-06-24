import { Icon } from "./Icon";
import { useTeamverT } from "../teamver/branding/useTeamverT";
import { resolveTeamverMainOrigin } from "../teamver/designApiBase";

type Props = {
  onDesignHome: () => void;
};

/** Embed project workspace — internal Design home vs external Teamver app. */
export function TeamverWorkspaceEscapeBar({ onDesignHome }: Props) {
  const t = useTeamverT();

  return (
    <header
      className="teamver-workspace-escape app-chrome-header"
      data-testid="teamver-workspace-escape"
    >
      <button
        type="button"
        className="teamver-workspace-escape__design-home"
        onClick={onDesignHome}
        title={t("teamver.embed.designHomeTitle")}
        data-testid="teamver-embed-design-home"
      >
        <Icon name="chevron-left" size={14} aria-hidden />
        <span>{t("teamver.embed.designHome")}</span>
      </button>
      <div className="teamver-workspace-escape__spacer" aria-hidden />
      <a
        className="teamver-workspace-escape__teamver-app"
        href={resolveTeamverMainOrigin()}
        title={t("teamver.embed.teamverAppTitle")}
        data-testid="teamver-embed-teamver-app"
      >
        <span>{t("teamver.embed.teamverApp")}</span>
        <Icon name="external-link" size={13} aria-hidden />
      </a>
    </header>
  );
}
