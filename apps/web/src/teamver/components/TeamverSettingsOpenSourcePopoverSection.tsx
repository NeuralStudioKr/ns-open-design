import { Icon } from "../../components/Icon";
import { TEAMVER_PRIMARY_OPEN_SOURCE_NOTICE } from "../branding/openSourceNotices";
import { useTeamverT } from "../branding/useTeamverT";

type Props = {
  onOpenAbout: () => void;
};

/** Compact Apache/MIT attribution inside the embed settings popover. */
export function TeamverSettingsOpenSourcePopoverSection({ onOpenAbout }: Props) {
  const t = useTeamverT();
  const primary = TEAMVER_PRIMARY_OPEN_SOURCE_NOTICE;

  return (
    <>
      <div className="entry-settings-menu__divider" aria-hidden />
      <section
        className="entry-settings-menu__section entry-settings-open-source"
        data-testid="entry-settings-open-source"
      >
        <div className="entry-settings-menu__section-title">
          <Icon name="info" size={13} />
          <span>{t("teamver.about.openSourceTitle")}</span>
        </div>
        <p className="entry-settings-open-source__summary">
          {primary.name} —{" "}
          <a
            href={primary.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${primary.name}: ${primary.license}`}
          >
            {primary.license}
          </a>
        </p>
        <button
          type="button"
          className="entry-settings-menu__item entry-settings-menu__item--primary"
          data-testid="entry-settings-open-about"
          role="menuitem"
          onClick={onOpenAbout}
        >
          <span className="entry-settings-menu__item-icon" aria-hidden>
            <Icon name="external-link" size={14} />
          </span>
          <span>{t("teamver.about.viewAllLicenses")}</span>
        </button>
      </section>
    </>
  );
}
