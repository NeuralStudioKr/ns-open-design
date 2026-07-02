/**
 * Teamver embed is slide-only: Drive publish offers PDF (team sharing) or
 * inline HTML (preview / AI ingest). Local 보내기 still offers ZIP/image/PPTX.
 */

export type DrivePublishFormat = "html" | "pdf";

export type DrivePublishMessaging = {
  menuTitlePdf: string;
  menuTitleHtml: string;
  modalTitle: string;
  modalSubtitle: string;
};

export type DrivePublishFormatOption = {
  value: DrivePublishFormat;
  label: string;
  description: string;
};

export const DRIVE_PUBLISH_FORMAT_OPTIONS: readonly DrivePublishFormatOption[] = [
  {
    value: "pdf",
    label: "PDF",
    description: "공유 드라이브·채널·DM에 올리기 좋습니다.",
  },
  {
    value: "html",
    label: "HTML",
    description: "Drive에서 바로 열어보고 AI 대화에도 활용할 수 있습니다.",
  },
] as const;

export type PublishBusyPhase = "idle" | "generating" | "uploading";

export function drivePublishMessaging(): DrivePublishMessaging {
  return {
    menuTitlePdf: "PDF로 드라이브에 올리기",
    menuTitleHtml: "HTML로 드라이브에 올리기",
    modalTitle: "드라이브에 올리기",
    modalSubtitle: "형식과 저장 위치를 선택해 주세요.",
  };
}

export function publishLabelForFormat(
  format: DrivePublishFormat,
  sharedDrive: boolean,
  phase: PublishBusyPhase,
): string {
  if (phase === "generating") return "PDF 생성 중…";
  if (phase === "uploading") return "업로드 중…";
  if (format === "pdf") {
    return sharedDrive ? "선택한 위치에 PDF 올리기" : "드라이브에 PDF 올리기";
  }
  return sharedDrive ? "선택한 위치에 HTML 올리기" : "드라이브에 HTML 올리기";
}

export function formatHintForSelection(format: DrivePublishFormat): string {
  const option = DRIVE_PUBLISH_FORMAT_OPTIONS.find((item) => item.value === format);
  return option?.description ?? "";
}

export function alternateDrivePublishFormat(format: DrivePublishFormat): DrivePublishFormat {
  return format === "pdf" ? "html" : "pdf";
}

export function formatDrivePublishKindLabel(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "pdf") return "PDF";
  if (normalized === "html") return "HTML";
  return kind.toUpperCase();
}
