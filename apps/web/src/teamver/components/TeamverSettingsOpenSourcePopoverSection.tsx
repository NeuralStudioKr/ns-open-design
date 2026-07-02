import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";

type Props = {
  onOpenAbout: () => void;
};

/** Compact Apache/MIT attribution inside the embed settings popover. */
export function TeamverSettingsOpenSourcePopoverSection({ onOpenAbout }: Props) {
  const t = useTeamverT();

  return (
    <>
      <div className="entry-settings-menu__divider" aria-hidden />
      <div
        className="entry-settings-open-source"
        data-testid="entry-settings-open-source"
      >
        <button
          type="button"
          className="entry-settings-menu__item"
          data-testid="entry-settings-open-about"
          role="menuitem"
          onClick={onOpenAbout}
          title={t("teamver.about.panelHint")}
        >
          <span className="entry-settings-menu__item-icon" aria-hidden>
            <Icon name="info" size={14} />
          </span>
          <span>{t("teamver.about.panelHint")}</span>
        </button>
      </div>
    </>
  );
}
