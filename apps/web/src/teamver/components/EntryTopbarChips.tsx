import { GithubStarBadge } from "../../components/GithubStarBadge";
import { Icon } from "../../components/Icon";
import { TeamverSessionBanner } from "../../components/TeamverSessionBanner";
import {
  formatDiscordPresenceCount,
  useDiscordPresence,
} from "../../components/useDiscordPresence";
import { useT } from "../../i18n";
import { isTeamverEmbedMode } from "../designApiBase";

const DISCORD_URL = "https://discord.gg/mHAjSMV6gz";

/** EntryShell topbar embed/non-embed chips — upstream drift 최소화 (10 §4.2). */
export function EntryTopbarChips() {
  const t = useT();
  const teamverEmbed = isTeamverEmbedMode();
  const discordPresence = useDiscordPresence();

  if (teamverEmbed) {
    return <TeamverSessionBanner teamverEmbed />;
  }

  const discordOnlineLabel = discordPresence
    ? t("entry.discordOnlineLabel", {
        count: formatDiscordPresenceCount(discordPresence.onlineCount),
      })
    : null;
  const discordAriaLabel = discordOnlineLabel
    ? t("entry.discordAriaWithOnline", { online: discordOnlineLabel })
    : t("entry.discordAria");

  return (
    <>
      <GithubStarBadge />
      <a
        className="entry-discord-badge od-tooltip"
        href={DISCORD_URL}
        aria-label={discordAriaLabel}
        data-tooltip={discordAriaLabel}
        data-tooltip-placement="bottom"
        data-testid="entry-discord-badge"
      >
        <Icon name="discord" size={14} className="entry-discord-badge__icon" />
        <span className="entry-discord-badge__label">{t("entry.discordLabel")}</span>
        {discordOnlineLabel ? (
          <>
            <span className="entry-discord-badge__sep" aria-hidden>
              ·
            </span>
            <span className="entry-discord-badge__online">{discordOnlineLabel}</span>
          </>
        ) : null}
      </a>
    </>
  );
}
