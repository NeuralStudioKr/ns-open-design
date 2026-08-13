// Home-only 2-step slide create wizard (docs-teamver/61).
// Pattern (not shared shell) with Canvas launch: content → template.
// CTA label is always "Create slides" — never embeds template names.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import {
  DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS,
  isExplicitCanvasSlideVisualTemplate,
  type CanvasSlideQuickSettings,
  type TeamverCanvasSlideTemplateOption,
} from "../canvasSlideLaunch";
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
  const [step, setStep] = useState<TeamverHomeSlideCreateStep>("content");
  const [templateVisited, setTemplateVisited] = useState(entry === "template");

  useEffect(() => {
    if (!open) return;
    setStep("content");
    setTemplateVisited(entry === "template");
  }, [open, entry]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirming) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, confirming, onClose]);

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
  const hasExplicitTemplate = isExplicitCanvasSlideVisualTemplate(selectedTemplate);
  // Gallery "Use template" / explicit pick: confirm from content immediately.
  // "New slide": require visiting the template step (기본 허용) so users don't
  // skip style entirely — but never treat mere visit as an explicit Daisy pick.
  const canConfirmFromContent =
    hasExplicitTemplate || (entry === "new" && templateVisited);
  const templateStepComplete = hasExplicitTemplate || (entry === "template" && templateReady);

  function goTemplateStep() {
    setTemplateVisited(true);
    setStep("template");
  }

  function updateQuickSetting<K extends keyof CanvasSlideQuickSettings>(
    key: K,
    value: CanvasSlideQuickSettings[K],
  ) {
    onQuickSettingsChange?.({ ...normalizedQuick, [key]: value });
  }

  const contentPanel = (
    <div className="teamver-home-slide-create-content" data-testid="teamver-home-slide-create-content">
      <div className="teamver-home-slide-create-attach">
        <p className="teamver-home-slide-create-section-title">
          {t("teamver.homeCreate.attachTitle")}
        </p>
        <div className="teamver-home-slide-create-attach-actions">
          <button
            type="button"
            className="teamver-home-slide-create-attach-btn"
            disabled={confirming}
            data-testid="teamver-home-slide-create-upload"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("teamver.homeCreate.upload")}
          </button>
          {onAttachFromDrive ? (
            <button
              type="button"
              className="teamver-home-slide-create-attach-btn"
              disabled={confirming}
              data-testid="teamver-home-slide-create-drive"
              onClick={onAttachFromDrive}
            >
              {t("teamver.homeCreate.drive")}
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const list = event.currentTarget.files;
              if (list && list.length > 0) onAddFiles?.(Array.from(list));
              event.currentTarget.value = "";
            }}
          />
        </div>
        {(stagedFiles.length > 0 || stagedDriveAssets.length > 0) && (
          <ul className="teamver-home-slide-create-chips">
            {stagedFiles.map((file, index) => (
              <li key={`file-${file.name}-${index}`}>
                <span>{file.name}</span>
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
                <span>{asset.filename ?? asset.assetId}</span>
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

      <div
        className="teamver-canvas-slide-launch-quick-settings"
        data-testid="teamver-home-slide-create-quick-settings"
      >
        <p className="teamver-canvas-slide-launch-quick-settings-title">
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

      <label
        className="teamver-home-slide-create-prompt-label"
        htmlFor="teamver-home-slide-create-prompt"
      >
        {t("teamver.homeCreate.promptLabel")}
      </label>
      <textarea
        id="teamver-home-slide-create-prompt"
        className="teamver-canvas-slide-launch-prompt-input"
        rows={6}
        value={userPrompt}
        disabled={confirming}
        placeholder={t("teamver.homeCreate.promptPlaceholder")}
        data-testid="teamver-home-slide-create-prompt"
        onChange={(event) => onUserPromptChange?.(event.currentTarget.value)}
      />

      {selectedTemplate ? (
        <button
          type="button"
          className={[
            "teamver-home-slide-create-selected-template",
            hasExplicitTemplate ? "is-explicit" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={confirming}
          data-testid="teamver-home-slide-create-selected-template"
          onClick={goTemplateStep}
        >
          <span className="teamver-home-slide-create-selected-template-label">
            {t("teamver.homeCreate.selectedTemplate")}
          </span>
          <span className="teamver-home-slide-create-selected-template-title">
            {hasExplicitTemplate
              ? selectedTemplate.title
              : t("teamver.homeCreate.defaultTemplate")}
          </span>
          <span className="teamver-home-slide-create-selected-template-action">
            {t("teamver.homeCreate.changeTemplate")}
          </span>
        </button>
      ) : null}
    </div>
  );

  const templatePanel = (
    <div
      className="teamver-canvas-slide-launch-template-section"
      data-testid="teamver-home-slide-create-template"
    >
      <p className="teamver-canvas-slide-launch-template-lead">
        {t("teamver.homeCreate.templateLead")}
      </p>
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
          onSelect={(id) => onTemplateChange?.(id)}
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
      className="teamver-drive-picker-backdrop"
      role="presentation"
      data-testid="teamver-home-slide-create-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onClose();
      }}
    >
      <div
        className={[
          "teamver-drive-picker-modal",
          "teamver-canvas-slide-launch-modal",
          "teamver-canvas-slide-launch-modal--wide",
          "teamver-home-slide-create-modal",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-home-slide-create-title"
        data-testid="teamver-home-slide-create-modal"
      >
        <header className="teamver-drive-picker-head">
          <h2 id="teamver-home-slide-create-title">{t("teamver.homeCreate.modalTitle")}</h2>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label={t("common.close")}
            disabled={confirming}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

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
            >
              <button
                type="button"
                className="teamver-home-slide-create-stepper-btn"
                disabled={confirming}
                data-testid="teamver-home-slide-create-step-template"
                onClick={goTemplateStep}
              >
                <span className="teamver-canvas-slide-launch-stepper-index" aria-hidden>
                  2
                </span>
                <span>{t("teamver.homeCreate.stepTemplate")}</span>
                {templateStepComplete && !showingTemplate ? (
                  <span className="teamver-home-slide-create-step-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          </ol>
        </nav>

        <div className="teamver-canvas-slide-launch-body teamver-home-slide-create-body">
          {showingTemplate ? templatePanel : contentPanel}
          {errorMessage ? (
            <p className="teamver-canvas-slide-launch-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="teamver-drive-import-footer">
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
          ) : (
            <span />
          )}
          {showingTemplate || canConfirmFromContent ? (
            <button
              type="button"
              className="teamver-drive-import-attach teamver-canvas-slide-launch-confirm"
              disabled={confirming || !templateReady}
              data-testid="teamver-home-slide-create-confirm"
              onClick={() => void onConfirm()}
            >
              {confirming
                ? t("teamver.homeCreate.creating")
                : t("teamver.homeCreate.confirm")}
            </button>
          ) : (
            <button
              type="button"
              className="teamver-drive-import-attach teamver-canvas-slide-launch-footer-next"
              disabled={confirming}
              data-testid="teamver-home-slide-create-next"
              onClick={goTemplateStep}
            >
              {t("teamver.homeCreate.nextTemplate")}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
