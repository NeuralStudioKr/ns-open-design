import { resolveTeamverDriveAssetUrl } from "./designApiBase";
import {
  alternateDrivePublishFormat,
  formatDrivePublishKindLabel,
  type DrivePublishFormat,
} from "./drivePublishMessaging";
import type { TeamverPublishDriveOutput } from "./publishToDrive";
import { pickReadyPublishOutputs } from "./publishToDrive";
import { TEAMVER_DRIVE_ASSET_LINK_LABEL } from "./teamverDriveDeepLink";

export type DrivePublishToastContent = {
  message: string;
  detailLinks: Array<{ label: string; href: string }>;
  alternateFormat: DrivePublishFormat;
  selectedFormat: DrivePublishFormat;
};

export function buildDrivePublishToastContent(
  outputs: TeamverPublishDriveOutput[],
  partial: boolean,
  selectedFormat: DrivePublishFormat,
): DrivePublishToastContent {
  const ready = pickReadyPublishOutputs(outputs);
  const failed = outputs.filter((output) => output.publishStatus === "failed");
  const detailLinks = ready
    .map((output) => {
      const href = output.driveAssetId
        ? resolveTeamverDriveAssetUrl(output.driveAssetId)
        : null;
      if (!href) return null;
      const kind = formatDrivePublishKindLabel(output.kind);
      return {
        label: `${kind} ${TEAMVER_DRIVE_ASSET_LINK_LABEL}`,
        href,
      };
    })
    .filter((link): link is { label: string; href: string } => link != null)
    .filter((link, index, links) => links.findIndex((item) => item.href === link.href) === index);

  let message = "Teamver 드라이브에 올렸습니다";
  if (partial) {
    const failedKinds = failed.map((output) => formatDrivePublishKindLabel(output.kind)).join(", ");
    message = failedKinds
      ? `Teamver 드라이브로 일부만 올렸습니다 (${failedKinds} 실패)`
      : "Teamver 드라이브로 일부만 올렸습니다";
  }

  return {
    message,
    detailLinks,
    alternateFormat: alternateDrivePublishFormat(selectedFormat),
    selectedFormat,
  };
}
