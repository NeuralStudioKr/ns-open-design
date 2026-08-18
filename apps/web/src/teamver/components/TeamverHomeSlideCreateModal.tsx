// Home-only 2-step slide create wizard (docs-teamver/61).
// Pattern (not shared shell) with Canvas launch: content → template.
// CTA label is always "Create slides" — never embeds template names.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import { EMBED_SLIDE_ATTACH_ACCEPT } from "../branding/embedFileAttachPolicy";
import {
  DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS,
  createHomeSlideCreateQuickSettings,
  hasHomeSlideCreateContent,
  isExplicitCanvasSlideVisualTemplate,
  type CanvasSlideQuickSettings,
  type TeamverCanvasSlideTemplateOption,
} from "../canvasSlideLaunch";
import { useTeamverDriveModalFocusTrap } from "../useTeamverDriveModalFocusTrap";
import { CanvasSlideTemplatePicker } from "./CanvasSlideTemplatePicker";

export type TeamverHomeSlideCreateEntry = "new" | "template";
export type TeamverHomeSlideCreateStep = "content" | "template";

type Props = {
  open: boolean;
  entry: TeamverHomeSlideCreateEntry;
  confirming?: boolean;
  errorMessage?: string | null;
  templateOptions?: TeamverCanvasSlideTemplateOption[];
  templatesLoading?: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  userPrompt?: string;
  onUserPromptChange?: (value: string) => void;
  quickSettings?: CanvasSlideQuickSettings;
  onQuickSettingsChange?: (settings: CanvasSlideQuickSettings) => void;
  stagedFiles?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  stagedDriveAssets?: TeamverDriveImportAsset[];
  onRemoveDriveAsset?: (assetId: string) => void;
  onAttachFromDrive?: () => void;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

const QUICK_SETTING_GROUPS = [
  {
    key: "audience",
    labelKey: "teamver.canvasSlideLaunch.quickAudience",
    options: [
      ["auto", "teamver.canvasSlideLaunch.quickAudienceAuto"],
      ["internal", "teamver.canvasSlideLaunch.quickAudienceInternal"],
      ["client", "teamver.canvasSlideLaunch.quickAudienceClient"],
      ["education", "teamver.canvasSlideLaunch.quickAudienceEducation"],
      ["business", "teamver.canvasSlideLaunch.quickAudienceBusiness"],
    ],
  },
  {
    key: "length",
    labelKey: "teamver.canvasSlideLaunch.quickLength",
    options: [
      ["auto", "teamver.canvasSlideLaunch.quickLengthAuto"],
      ["short", "teamver.canvasSlideLaunch.quickLengthShort"],
      ["standard", "teamver.canvasSlideLaunch.quickLengthStandard"],
      ["detailed", "teamver.canvasSlideLaunch.quickLengthDetailed"],
    ],
  },
  {
    key: "tone",
    labelKey: "teamver.canvasSlideLaunch.quickTone",
    options: [
      ["auto", "teamver.canvasSlideLaunch.quickToneAuto"],
      ["professional", "teamver.canvasSlideLaunch.quickToneProfessional"],
      ["modern", "teamver.canvasSlideLaunch.quickToneModern"],
      ["friendly", "teamver.canvasSlideLaunch.quickToneFriendly"],
      ["impact", "teamver.canvasSlideLaunch.quickToneImpact"],
    ],
  },
] as const;

function collectTransferFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const fromList = Array.from(data.files ?? []);
  if (fromList.length > 0) return fromList;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

function shouldReadAsyncClipboard(data: DataTransfer | null | undefined): boolean {
  if (!data) return true;
  if (collectTransferFiles(data).length > 0) return false;
  const types = Array.from(data.types ?? []);
  if (types.some((type) => type === "text/plain" || type === "text/html")) return false;
  return types.length === 0 || types.some((type) => type === "Files" || type.startsWith("image/"));
}

async function readClipboardImageFiles(): Promise<File[]> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    const stamp = Date.now();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const extension = imageType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      files.push(new File([blob], `clipboard-screenshot-${stamp}.${extension}`, { type: imageType }));
    }
    return files;
  } catch {
    return [];
  }
}

export function TeamverHomeSlideCreateModal({
  open,
  entry,
  confirming = false,
  errorMessage = null,
  templateOptions = [],
  templatesLoading = false,
  selectedTemplateId = "",
  onTemplateChange,
  userPrompt = "",
  onUserPromptChange,
  quickSettings = DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS,
  onQuickSettingsChange,
  stagedFiles = [],
  onAddFiles,
  onRemoveFile,
  stagedDriveAssets = [],
  onRemoveDriveAsset,
  onAttachFromDrive,
  onConfirm,
  onClose,
}: Props) {
  const t = useTeamverT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<TeamverHomeSlideCreateStep>("content");
  const [templateVisited, setTemplateVisited] = useState(entry === "template");
  const [dragActive, setDragActive] = useState(false);
  const wasOpenRef = useRef(false);

  useTeamverDriveModalFocusTrap(open, dialogRef);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setDragActive(false);
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    setStep("content");
    setTemplateVisited(entry === "template");
    if (justOpened) {
      onQuickSettingsChange?.(createHomeSlideCreateQuickSettings());
    }
  }, [open, entry, onQuickSettingsChange]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prevBodyOverflow = document.body.style.overflow;
    const scrollContainers = Array.from(document.querySelectorAll(".entry-main--scroll"));
    const prevScrollOverflows = scrollContainers.map(
      (node) => (node as HTMLElement).style.overflow,
    );
    document.body.style.overflow = "hidden";
    scrollContainers.forEach((node) => {
      (node as HTMLElement).style.overflow = "hidden";
    });
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      scrollContainers.forEach((node, index) => {
        (node as HTMLElement).style.overflow = prevScrollOverflows[index] ?? "";
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    function isTopmostPickerBackdrop(): boolean {
      const backdrops = document.querySelectorAll(".teamver-drive-picker-backdrop");
      const top = backdrops[backdrops.length - 1];
      return !top || top === backdropRef.current;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || confirming) return;
      if (!isTopmostPickerBackdrop()) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, confirming, onClose]);

  useEffect(() => {
    if (!open || confirming) return;
    const node = dialogRef.current;
    if (!node) return;
    function onPaste(event: ClipboardEvent) {
      const files = collectTransferFiles(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        onAddFiles?.(files);
        return;
      }
      if (!shouldReadAsyncClipboard(event.clipboardData)) return;
      void readClipboardImageFiles().then((images) => {
        if (images.length > 0) onAddFiles?.(images);
      });
    }
    node.addEventListener("paste", onPaste);
    return () => node.removeEventListener("paste", onPaste);
  }, [open, confirming, onAddFiles]);

  useEffect(() => {
    if (!open || confirming || typeof document === "undefined") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const frame = window.requestAnimationFrame(() => {
      if (step === "content") {
        dialog.querySelector<HTMLElement>("[data-teamver-drive-autofocus='true']")?.focus();
        return;
      }
      (
        dialog.querySelector<HTMLElement>("[data-testid='teamver-home-slide-create-prev']")
        ?? dialog
      ).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, confirming, step]);

  const normalizedQuick = useMemo(
    () => ({ ...DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS, ...quickSettings }),
    [quickSettings],
  );

  const selectedTemplate = useMemo(() => {
    return (
      templateOptions.find((option) => option.id === selectedTemplateId)
      ?? (selectedTemplateId
        ? { id: selectedTemplateId, title: selectedTemplateId, record: null }
        : null)
    );
  }, [selectedTemplateId, templateOptions]);

  if (!open || typeof document === "undefined") return null;

  const templateReady = Boolean(selectedTemplate?.id);
  const showingTemplate = step === "template";
  const hasContent = hasHomeSlideCreateContent({
    prompt: userPrompt,
    files: stagedFiles,
    driveAssets: stagedDriveAssets,
  });
  const emptyHint = hasContent ? undefined : t("teamver.homeCreate.needBriefOrAttach");
  const hasExplicitTemplate = isExplicitCanvasSlideVisualTemplate(selectedTemplate);
  // Gallery "Use template": confirm from content even if the user later
  // switches to the L1 default. Explicit pick: same. "New slide": require
  // visiting the template step so users don't skip it — but never treat mere
  // visit as an explicit Daisy pick.
  const canConfirmFromContent =
    entry === "template" || hasExplicitTemplate || (entry === "new" && templateVisited);
  const templateStepComplete =
    hasExplicitTemplate
    || (entry === "template" && templateReady)
    || (entry === "new" && templateVisited && templateReady);
  const stepperPickTitle = hasExplicitTemplate
    ? selectedTemplate?.title
    : (entry === "template" || templateVisited) && selectedTemplate
      ? t("teamver.homeCreate.defaultTemplate")
      : null;

  function goTemplateStep() {
    if (!hasContent) return;
    setTemplateVisited(true);
    setStep("template");
  }

  function submitFromKeyboard() {
    if (confirming || !hasContent) return;
    if (showingTemplate || canConfirmFromContent) {
      if (templateReady) void onConfirm();
      return;
    }
    goTemplateStep();
  }

  const attachCount = stagedFiles.length + stagedDriveAssets.length;
  const summaryParts = [
    t(
      QUICK_SETTING_GROUPS[0].options.find(([value]) => value === normalizedQuick.audience)?.[1]
        ?? "teamver.canvasSlideLaunch.quickAudienceAuto",
    ),
    t(
      QUICK_SETTING_GROUPS[1].options.find(([value]) => value === normalizedQuick.length)?.[1]
        ?? "teamver.canvasSlideLaunch.quickLengthAuto",
    ),
    t(
      QUICK_SETTING_GROUPS[2].options.find(([value]) => value === normalizedQuick.tone)?.[1]
        ?? "teamver.canvasSlideLaunch.quickToneAuto",
    ),
    attachCount > 0 ? t("teamver.homeCreate.summaryAttach", { count: attachCount }) : null,
  ].filter((part): part is string => Boolean(part));

  function addDroppedFiles(files: File[]) {
    if (confirming || files.length === 0) return;
    onAddFiles?.(files);
  }

  function onAttachDragEnter(event: { dataTransfer?: DataTransfer | null; preventDefault: () => void }) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    setDragActive(true);
  }

  function onAttachDragOver(event: {
    dataTransfer?: DataTransfer | null;
    preventDefault: () => void;
  }) {
    const dt = event.dataTransfer;
    if (!dt?.types.includes("Files")) return;
    event.preventDefault();
    dt.dropEffect = "copy";
    setDragActive(true);
  }

  function onAttachDragLeave(event: { currentTarget: EventTarget; relatedTarget: EventTarget | null }) {
    const current = event.currentTarget;
    const related = event.relatedTarget;
    if (current instanceof Node && related instanceof Node && current.contains(related)) return;
    setDragActive(false);
  }

  function onAttachDrop(event: { dataTransfer: DataTransfer | null; preventDefault: () => void }) {
    event.preventDefault();
    setDragActive(false);
    addDroppedFiles(collectTransferFiles(event.dataTransfer));
  }

  function updateQuickSetting<K extends keyof CanvasSlideQuickSettings>(
    key: K,
    value: CanvasSlideQuickSettings[K],
  ) {
    onQuickSettingsChange?.({ ...normalizedQuick, [key]: value });
  }

  const driveUnavailable = !onAttachFromDrive;
  const driveHint = driveUnavailable ? t("teamver.homeCreate.driveUnavailable") : undefined;

  const contentPanel = (
    <div className="teamver-home-slide-create-content" data-testid="teamver-home-slide-create-content">
      <div className="teamver-home-slide-create-section teamver-home-slide-create-attach">
        <p className="teamver-home-slide-create-section-title">
          {t("teamver.homeCreate.attachTitle")}
        </p>
        <div
          className={[
            "teamver-home-slide-create-attach-zone",
            dragActive ? "is-drag-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="teamver-home-slide-create-attach-zone"
          aria-label={t("teamver.homeCreate.attachHint")}
          onDragEnter={onAttachDragEnter}
          onDragOver={onAttachDragOver}
          onDragLeave={onAttachDragLeave}
          onDrop={onAttachDrop}
        >
          <div
            className="teamver-home-slide-create-attach-menu"
            role="group"
            aria-label={t("teamver.homeCreate.attachTitle")}
          >
            <button
              type="button"
              className="teamver-home-slide-create-attach-item"
              disabled={confirming || driveUnavailable}
              title={driveHint}
              aria-label={
                driveUnavailable
                  ? `${t("teamver.homeCreate.drive")}. ${driveHint}`
                  : undefined
              }
              data-testid="teamver-home-slide-create-drive"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAttachFromDrive}
            >
              <Icon name="folder" size={18} className="teamver-home-slide-create-attach-item-icon" />
              <span>{t("teamver.homeCreate.drive")}</span>
            </button>
            <button
              type="button"
              className="teamver-home-slide-create-attach-item"
              disabled={confirming}
              data-testid="teamver-home-slide-create-upload"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload" size={18} className="teamver-home-slide-create-attach-item-icon" />
              <span>{t("teamver.homeCreate.upload")}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={EMBED_SLIDE_ATTACH_ACCEPT}
              onChange={(event) => {
                const list = event.currentTarget.files;
                if (list && list.length > 0) onAddFiles?.(Array.from(list));
                event.currentTarget.value = "";
              }}
            />
          </div>
          <p className="teamver-home-slide-create-attach-hint">{t("teamver.homeCreate.attachHint")}</p>
          {(stagedFiles.length > 0 || stagedDriveAssets.length > 0) && (
            <ul className="teamver-home-slide-create-chips">
              {stagedFiles.map((file, index) => (
                <li key={`file-${file.name}-${index}`}>
                  <span title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    aria-label={t("teamver.homeCreate.removeAttach")}
                    disabled={confirming}
                    onClick={() => onRemoveFile?.(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
              {stagedDriveAssets.map((asset) => (
                <li key={`drive-${asset.assetId}`}>
                  <span title={asset.filename ?? asset.assetId}>
                    {asset.filename ?? asset.assetId}
                  </span>
                  <button
                    type="button"
                    aria-label={t("teamver.homeCreate.removeAttach")}
                    disabled={confirming}
                    onClick={() => onRemoveDriveAsset?.(asset.assetId)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="teamver-home-slide-create-section teamver-canvas-slide-launch-quick-settings"
        data-testid="teamver-home-slide-create-quick-settings"
      >
        <p className="teamver-home-slide-create-section-title">
          {t("teamver.canvasSlideLaunch.quickSettingsTitle")}
        </p>
        {QUICK_SETTING_GROUPS.map((group) => (
          <div
            key={group.key}
            className="teamver-canvas-slide-launch-quick-group"
          >
            <span className="teamver-canvas-slide-launch-quick-label">
              {t(group.labelKey)}
            </span>
            <div className="teamver-canvas-slide-launch-quick-options">
              {group.options.map(([value, labelKey]) => {
                const selected = normalizedQuick[group.key] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={[
                      "teamver-canvas-slide-launch-quick-chip",
                      selected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={confirming}
                    aria-pressed={selected}
                    data-testid={`teamver-home-slide-create-quick-${group.key}-${value}`}
                    onClick={() =>
                      updateQuickSetting(
                        group.key,
                        value as CanvasSlideQuickSettings[typeof group.key],
                      )
                    }
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="teamver-home-slide-create-section">
        <label
          className="teamver-home-slide-create-section-title"
          htmlFor="teamver-home-slide-create-prompt"
        >
          {t("teamver.homeCreate.promptLabel")}
        </label>
        <textarea
          id="teamver-home-slide-create-prompt"
          className="teamver-canvas-slide-launch-prompt-input teamver-home-slide-create-prompt"
          rows={5}
          value={userPrompt}
          disabled={confirming}
          placeholder={t("teamver.homeCreate.promptPlaceholder")}
          data-testid="teamver-home-slide-create-prompt"
          data-teamver-drive-autofocus="true"
          onChange={(event) => onUserPromptChange?.(event.currentTarget.value)}
        />
      </div>
    </div>
  );

  const templatePanel = (
    <div
      className="teamver-canvas-slide-launch-template-section"
      data-testid="teamver-home-slide-create-template"
    >
      {templatesLoading ? (
        <div
          className="teamver-canvas-slide-launch-template-skeleton"
          aria-busy="true"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <span
              key={index}
              className="teamver-canvas-slide-launch-skeleton teamver-canvas-slide-launch-template-skeleton-card"
            />
          ))}
        </div>
      ) : templateOptions.length > 0 ? (
        <CanvasSlideTemplatePicker
          options={templateOptions}
          selectedTemplateId={selectedTemplate?.id ?? ""}
          disabled={confirming}
          label={t("teamver.homeCreate.templateLead")}
          onSelect={(id) => {
            onTemplateChange?.(id);
            // Gallery entry already confirmed a look — picking again is a
            // change, then return to content + ✓ (docs-teamver/61 안 B).
            if (entry === "template") setStep("content");
          }}
        />
      ) : (
        <p className="teamver-canvas-slide-launch-template-fallback">
          {t("teamver.canvasSlideLaunch.templateFallback")}
        </p>
      )}
    </div>
  );

  return createPortal(
    <div
      ref={backdropRef}
      className="teamver-drive-picker-backdrop"
      role="presentation"
      data-testid="teamver-home-slide-create-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || confirming) return;
        const backdrops = document.querySelectorAll(".teamver-drive-picker-backdrop");
        const top = backdrops[backdrops.length - 1];
        if (top && top !== event.currentTarget) return;
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={[
          "teamver-drive-picker-modal",
          "teamver-canvas-slide-launch-modal",
          showingTemplate
            ? "teamver-canvas-slide-launch-modal--wide"
            : "teamver-home-slide-create-modal--compact",
          "teamver-home-slide-create-modal",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-home-slide-create-title"
        aria-describedby="teamver-home-slide-create-lead"
        tabIndex={-1}
        data-testid="teamver-home-slide-create-modal"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          submitFromKeyboard();
        }}
      >
        <header className="teamver-drive-picker-head teamver-home-slide-create-head">
          <div className="teamver-home-slide-create-head-row">
            <div className="teamver-home-slide-create-head-copy">
              <h2 id="teamver-home-slide-create-title">{t("teamver.homeCreate.modalTitle")}</h2>
              <p
                id="teamver-home-slide-create-lead"
                className="teamver-home-slide-create-lead"
                data-testid="teamver-home-slide-create-lead"
              >
                {t("teamver.homeCreate.lead")}
              </p>
            </div>
            <button
              type="button"
              className="teamver-drive-picker-close"
              aria-label={t("common.close")}
              disabled={confirming}
              onClick={onClose}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <nav
            className="teamver-canvas-slide-launch-stepper"
            aria-label={t("teamver.homeCreate.stepperAria")}
            data-testid="teamver-home-slide-create-stepper"
          >
            <ol className="teamver-canvas-slide-launch-stepper-list">
            <li
              className={[
                "teamver-canvas-slide-launch-stepper-item",
                step === "content" ? "is-current" : "is-complete",
              ].join(" ")}
              aria-current={step === "content" ? "step" : undefined}
            >
              <button
                type="button"
                className="teamver-home-slide-create-stepper-btn"
                disabled={confirming}
                data-testid="teamver-home-slide-create-step-content"
                onClick={() => setStep("content")}
              >
                <span className="teamver-canvas-slide-launch-stepper-index" aria-hidden>
                  1
                </span>
                <span>{t("teamver.homeCreate.stepContent")}</span>
              </button>
            </li>
            <li
              className={[
                "teamver-canvas-slide-launch-stepper-item",
                showingTemplate
                  ? "is-current"
                  : templateStepComplete
                    ? "is-complete"
                    : templateVisited
                      ? "is-complete"
                      : "is-upcoming",
              ].join(" ")}
              aria-current={showingTemplate ? "step" : undefined}
            >
              <button
                type="button"
                className="teamver-home-slide-create-stepper-btn"
                disabled={confirming || !hasContent}
                title={emptyHint}
                data-testid="teamver-home-slide-create-step-template"
                aria-label={
                  stepperPickTitle
                    ? `${t("teamver.homeCreate.stepTemplate")} ${stepperPickTitle}`
                    : t("teamver.homeCreate.stepTemplate")
                }
                onClick={goTemplateStep}
              >
                <span className="teamver-canvas-slide-launch-stepper-index" aria-hidden>
                  2
                </span>
                <span>{t("teamver.homeCreate.stepTemplate")}</span>
                {stepperPickTitle ? (
                  <span
                    className="teamver-home-slide-create-step-pick"
                    data-testid="teamver-home-slide-create-step-pick"
                  >
                    {stepperPickTitle}
                  </span>
                ) : null}
                {templateStepComplete && !showingTemplate ? (
                  <span className="teamver-home-slide-create-step-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          </ol>
          </nav>
        </header>

        <div className="teamver-canvas-slide-launch-body teamver-home-slide-create-body">
          {showingTemplate ? templatePanel : contentPanel}
          {errorMessage ? (
            <p
              className="teamver-canvas-slide-launch-error"
              role="alert"
              data-testid="teamver-home-slide-create-error"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="teamver-drive-import-footer teamver-home-slide-create-footer">
          {!hasContent ? (
            <p
              id="teamver-home-slide-create-empty-hint"
              className="teamver-home-slide-create-summary"
              data-testid="teamver-home-slide-create-empty-hint"
            >
              {t("teamver.homeCreate.needBriefOrAttach")}
            </p>
          ) : showingTemplate ? (
            <p
              className="teamver-home-slide-create-summary"
              data-testid="teamver-home-slide-create-summary"
            >
              {summaryParts.join(" · ")}
            </p>
          ) : null}
          <div className="teamver-home-slide-create-footer-actions">
            {showingTemplate ? (
              <button
                type="button"
                className="teamver-drive-import-cancel"
                disabled={confirming}
                data-testid="teamver-home-slide-create-prev"
                onClick={() => setStep("content")}
              >
                {t("teamver.canvasSlideLaunch.back")}
              </button>
            ) : null}
            {showingTemplate || canConfirmFromContent ? (
              <button
                type="button"
                className="teamver-drive-import-attach teamver-canvas-slide-launch-confirm"
                disabled={confirming || !templateReady || !hasContent}
                title={emptyHint}
                aria-describedby={!hasContent ? "teamver-home-slide-create-empty-hint" : undefined}
                data-testid="teamver-home-slide-create-confirm"
                onClick={() => {
                  if (!hasContent || !templateReady || confirming) return;
                  void onConfirm();
                }}
              >
                {confirming
                  ? t("teamver.homeCreate.creating")
                  : t("teamver.homeCreate.confirm")}
              </button>
            ) : (
              <button
                type="button"
                className="teamver-drive-import-attach teamver-canvas-slide-launch-footer-next"
                disabled={confirming || !hasContent}
                title={emptyHint}
                aria-describedby={!hasContent ? "teamver-home-slide-create-empty-hint" : undefined}
                data-testid="teamver-home-slide-create-next"
                onClick={goTemplateStep}
              >
                {t("teamver.homeCreate.nextTemplate")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
