import type { Dict } from "../../i18n/types";
import { RemixIcon } from "../../components/RemixIcon";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import { embedUiLabel } from "../embedUiLabels";
import { drivePublishMessaging } from "../drivePublishMessaging";
import type { DrivePublishFormat } from "../drivePublishMessaging";

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type TeamverExportMenuProps = {
  t: TranslateFn;
  fileName: string;
  showPptxExport: boolean;
  canPptx: boolean;
  onExportAsPptx?: (filePath: string) => void;
  streaming: boolean;
  showImageExport: boolean;
  showMarkdownExport: boolean;
  savingTemplate: boolean;
  templateNote: string | null;
  onCloseMenu: () => void;
  onOpenDrivePublish: (format?: DrivePublishFormat) => void;
  onOpenImageExport: () => void;
  onOpenSaveAsTemplate: () => void;
  fireShareExport: (format: string, action: () => void | Promise<void>) => void;
  exportPdf: () => void | Promise<void>;
  exportHtml: () => void | Promise<void>;
  exportZip: () => void | Promise<void>;
  exportMarkdown: () => void;
};

export function TeamverExportMenu({
  t,
  showPptxExport,
  canPptx,
  onExportAsPptx,
  streaming,
  showImageExport,
  showMarkdownExport,
  savingTemplate,
  templateNote,
  fileName,
  onCloseMenu,
  onOpenDrivePublish,
  onOpenImageExport,
  onOpenSaveAsTemplate,
  fireShareExport,
  exportPdf,
  exportHtml,
  exportZip,
  exportMarkdown,
}: TeamverExportMenuProps) {
  const driveCopy = drivePublishMessaging();

  return (
    <>
      <div className="share-menu-section-label" role="presentation">
        {embedUiLabel("Save to this device", "내 컴퓨터에 저장")}
      </div>
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        onClick={() => {
          onCloseMenu();
          fireShareExport("pdf", () => exportPdf());
        }}
      >
        <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
        <span>{t("fileViewer.exportPdf")}</span>
      </button>
      {showPptxExport ? (
        <button
          type="button"
          className="share-menu-item"
          role="menuitem"
          disabled={!canPptx}
          title={
            onExportAsPptx
              ? streaming
                ? t("fileViewer.exportPptxBusy")
                : t("fileViewer.exportPptxHint")
              : t("fileViewer.exportPptxNa")
          }
          onClick={() => {
            onCloseMenu();
            fireShareExport("pptx", () => {
              if (onExportAsPptx) onExportAsPptx(fileName);
            });
          }}
        >
          <span className="share-menu-icon"><RemixIcon name="file-ppt-line" size={15} /></span>
          <span>{t("fileViewer.exportPptx")}</span>
        </button>
      ) : null}
      {showImageExport ? (
        <button
          type="button"
          className="share-menu-item"
          role="menuitem"
          onClick={() => {
            onCloseMenu();
            onOpenImageExport();
          }}
        >
          <span className="share-menu-icon"><RemixIcon name="image-line" size={15} /></span>
          <span>{t("fileViewer.exportImage")}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        onClick={() => {
          onCloseMenu();
          fireShareExport("html", () => exportHtml());
        }}
      >
        <span className="share-menu-icon"><RemixIcon name="file-code-line" size={15} /></span>
        <span>{t("fileViewer.exportHtml")}</span>
      </button>
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        onClick={() => {
          onCloseMenu();
          fireShareExport("zip", () => exportZip());
        }}
      >
        <span className="share-menu-icon"><RemixIcon name="file-zip-line" size={15} /></span>
        <span>{t("fileViewer.exportZip")}</span>
      </button>
      {showMarkdownExport ? (
        <button
          type="button"
          className="share-menu-item"
          role="menuitem"
          onClick={() => {
            onCloseMenu();
            fireShareExport("markdown", exportMarkdown);
          }}
        >
          <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
          <span>{t("fileViewer.exportMd")}</span>
        </button>
      ) : null}
      {isTeamverEmbedMode() ? (
        <>
          <div className="share-menu-divider" />
          <div className="share-menu-section-label" role="presentation">
            Teamver 드라이브
          </div>
          <button
            type="button"
            className="share-menu-item"
            role="menuitem"
            data-testid="teamver-open-publish-drive-modal-pdf"
            onClick={() => {
              onCloseMenu();
              onOpenDrivePublish("pdf");
            }}
          >
            <span className="share-menu-icon">
              <Icon name="upload" size={15} />
            </span>
            <span>{driveCopy.menuTitlePdf}</span>
          </button>
          <button
            type="button"
            className="share-menu-item"
            role="menuitem"
            data-testid="teamver-open-publish-drive-modal-html"
            onClick={() => {
              onCloseMenu();
              onOpenDrivePublish("html");
            }}
          >
            <span className="share-menu-icon">
              <Icon name="upload" size={15} />
            </span>
            <span>{driveCopy.menuTitleHtml}</span>
          </button>
        </>
      ) : null}
      <div className="share-menu-divider" />
      <div className="share-menu-section-label" role="presentation">
        {t("fileViewer.shareMenuSave")}
      </div>
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        disabled={savingTemplate}
        onClick={() => {
          fireShareExport("template", onOpenSaveAsTemplate);
        }}
      >
        <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
        <span>
          {savingTemplate
            ? t("fileViewer.savingTemplate")
            : templateNote
              ? templateNote
              : t("fileViewer.saveAsTemplate")}
        </span>
      </button>
    </>
  );
}
