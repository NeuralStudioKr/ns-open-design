/**
 * Teamver embed is slide-only: Drive publish offers PDF (team sharing),
 * inline HTML (preview / AI ingest), and PPTX (PowerPoint follow-up).
 * Local 보내기 still offers ZIP/image as well.
 */

export type DrivePublishFormat = "html" | "pdf" | "pptx";

export type DrivePublishMessaging = {
  menuTitlePdf: string;
  menuTitleHtml: string;
  menuTitlePptx: string;
  modalTitle: string;
  modalSubtitle: string;
};

export type DrivePublishFormatBenefit = {
  example: string;
  benefit: string;
};

export type DrivePublishFormatOption = {
  value: DrivePublishFormat;
  label: string;
  example: string;
  benefit: string;
};

export const DRIVE_PUBLISH_FORMAT_OPTIONS: readonly DrivePublishFormatOption[] = [
  {
    value: "pdf",
    label: "PDF",
    example: "채팅·메일로 보낼 때",
    benefit: "바로 열 수 있습니다. 한 장이 페이지 한 장입니다.",
  },
  {
    value: "html",
    label: "HTML",
    example: "다시 볼 때, AI와 이야기할 때",
    benefit: "슬라이드를 넘기며 볼 수 있습니다. AI에게 알려 주고 이야기할 수 있습니다.",
  },
  {
    value: "pptx",
    label: "PPTX",
    example: "PowerPoint에서 수정할 때",
    benefit: "드라이브에 올려 동료와 같이 열고 편집할 수 있습니다.",
  },
] as const;

export type PublishBusyPhase = "idle" | "generating" | "uploading";

export function drivePublishMessaging(): DrivePublishMessaging {
  return {
    menuTitlePdf: "PDF로 드라이브에 올리기",
    menuTitleHtml: "HTML로 드라이브에 올리기",
    menuTitlePptx: "PPTX로 드라이브에 올리기",
    modalTitle: "드라이브에 올리기",
    modalSubtitle: "형식과 저장 위치를 선택해 주세요.",
  };
}

export function publishLabelForFormat(
  format: DrivePublishFormat,
  sharedDrive: boolean,
  phase: PublishBusyPhase,
): string {
  if (phase === "generating") {
    if (format === "pdf") return "PDF 생성 중…";
    if (format === "html") return "HTML 생성 중…";
    return "PPTX 생성 중…";
  }
  if (phase === "uploading") return "업로드 중…";
  if (format === "pdf") {
    return sharedDrive ? "선택한 위치에 PDF 올리기" : "드라이브에 PDF 올리기";
  }
  if (format === "html") {
    return sharedDrive ? "선택한 위치에 HTML 올리기" : "드라이브에 HTML 올리기";
  }
  return sharedDrive ? "선택한 위치에 PPTX 올리기" : "드라이브에 PPTX 올리기";
}

export function formatBenefitForSelection(format: DrivePublishFormat): DrivePublishFormatBenefit | null {
  const option = DRIVE_PUBLISH_FORMAT_OPTIONS.find((item) => item.value === format);
  if (!option) return null;
  return { example: option.example, benefit: option.benefit };
}

/** Flat string for tests and legacy call sites. */
export function formatHintForSelection(format: DrivePublishFormat): string {
  const benefit = formatBenefitForSelection(format);
  if (!benefit) return "";
  return `예: ${benefit.example} — ${benefit.benefit}`;
}

export function alternateDrivePublishFormat(format: DrivePublishFormat): DrivePublishFormat {
  if (format === "pdf") return "html";
  if (format === "html") return "pptx";
  return "pdf";
}

export function formatDrivePublishKindLabel(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  if (normalized === "pdf") return "PDF";
  if (normalized === "html") return "HTML";
  if (normalized === "pptx") return "PPTX";
  return kind.toUpperCase();
}
