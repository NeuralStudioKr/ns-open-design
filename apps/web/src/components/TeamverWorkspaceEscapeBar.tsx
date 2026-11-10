import { Icon } from "./Icon";
import { useTeamverT } from "../teamver/branding/useTeamverT";

type Props = {
  onDesignHome: () => void;
};

/** Embed project workspace — Slide home. Main Teamver is the left-rail logo. */
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
    </header>
  );
}
