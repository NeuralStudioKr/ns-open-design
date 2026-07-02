import { TEAMVER_OPEN_SOURCE_NOTICES } from "../branding/openSourceNotices";
import { useTeamverT } from "../branding/useTeamverT";

export function TeamverAboutOpenSourceSection() {
  const t = useTeamverT();

  return (
    <div
      className="settings-about-open-source"
      data-testid="teamver-about-open-source"
      aria-labelledby="teamver-about-open-source-title"
    >
      <div className="settings-about-open-source-header">
        <h4 id="teamver-about-open-source-title">{t("teamver.about.openSourceTitle")}</h4>
        <p className="hint">{t("teamver.about.openSourceIntro")}</p>
        <p className="hint">{t("teamver.about.basedOn")}</p>
      </div>
      <ul className="settings-about-open-source-list">
        {TEAMVER_OPEN_SOURCE_NOTICES.map((notice) => (
          <li key={notice.id} className="settings-about-open-source-item">
            <div className="settings-about-open-source-item-head">
              <strong>{notice.name}</strong>
              {notice.sourceUrl ? (
                <a
                  href={notice.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-about-open-source-source-link"
                  aria-label={`${notice.name} source repository`}
                >
                  {notice.sourceUrl.replace(/^https:\/\//, "")}
                </a>
              ) : null}
            </div>
            <dl className="settings-about-open-source-meta">
              <div>
                <dt>{t("teamver.about.copyright")}</dt>
                <dd>{notice.copyright}</dd>
              </div>
              <div>
                <dt>{t("teamver.about.license")}</dt>
                <dd>
                  <a
                    href={notice.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${notice.name}: ${notice.license}`}
                  >
                    {notice.license}
                  </a>
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
