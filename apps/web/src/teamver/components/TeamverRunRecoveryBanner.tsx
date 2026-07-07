import { useTeamverT } from "../branding/useTeamverT";
import type { RunRecoveryBannerPhase } from "../backgroundChatRecovery";

type Props = {
  phase: RunRecoveryBannerPhase;
  savedChars: number;
  runStatus: "queued" | "running";
};

/**
 * In-project banner while re-attaching to a background daemon/BYOK run after
 * navigation away. Surfaces checkpointed progress so re-entry is not a blank
 * screen with no feedback.
 */
export function TeamverRunRecoveryBanner({ phase, savedChars, runStatus }: Props) {
  const t = useTeamverT();

  let detail: string;
  if (phase === "queued" || runStatus === "queued") {
    detail = t("teamver.runRecovery.queued");
  } else if (phase === "connecting") {
    detail =
      savedChars > 0
        ? t("teamver.runRecovery.connectingWithSaved", { n: savedChars })
        : t("teamver.runRecovery.connecting");
  } else {
    detail =
      savedChars > 0
        ? t("teamver.runRecovery.liveWithSaved", { n: savedChars })
        : t("teamver.runRecovery.live");
  }

  return (
    <div
      className="teamver-run-recovery"
      role="status"
      aria-live="polite"
      data-testid="teamver-run-recovery-banner"
    >
      <span className="teamver-run-recovery__pulse" aria-hidden />
      <div className="teamver-run-recovery__copy">
        <span className="teamver-run-recovery__title">{t("teamver.runRecovery.title")}</span>
        <span className="teamver-run-recovery__detail">{detail}</span>
      </div>
    </div>
  );
}
