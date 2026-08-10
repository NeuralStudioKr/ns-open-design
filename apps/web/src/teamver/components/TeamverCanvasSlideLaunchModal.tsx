import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import {
  mergeCanvasLaunchHandoffPreview,
  type TeamverCanvasLaunchHandoff,
} from "../canvasLaunchHandoff";
import { fetchTeamverCanvasPreview } from "../fetchCanvasPreview";
import { driveImportAssetIconName } from "../driveFileVisual";
import {
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  type CanvasSlideQuickSettings,
  type TeamverCanvasSlideTemplateOption,
} from "../canvasSlideLaunch";
import { CanvasSlideTemplatePicker } from "./CanvasSlideTemplatePicker";
import {
  CanvasSlideLaunchStepWizard,
  type CanvasSlideLaunchWizardStep,
  type CanvasSlideLaunchWizardStepId,
} from "./CanvasSlideLaunchStepWizard";
import { formatTeamverTimestampKst } from "../teamverTimestamp";

export type TeamverCanvasSlideLaunchSource =
  | { kind: "drive"; asset: TeamverDriveImportAsset }
  | { kind: "canvas"; handoff: TeamverCanvasLaunchHandoff };

type Props = {
  open: boolean;
  source: TeamverCanvasSlideLaunchSource;
  confirming?: boolean;
  errorMessage?: string | null;
  /** When set with an error, show Main re-login CTA (Main SSO gate). */
  onRelogin?: (() => void) | null;
  templateOptions?: TeamverCanvasSlideTemplateOption[];
  /**
   * True while the deck-template catalog is still loading. Reserves the
   * optional template wizard step (and wide modal chrome) so the stepper
   * does not jump 2→3 when the fetch settles.
   */
  templatesLoading?: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  /** Optional user instruction merged into the first Design turn prompt. */
  userPrompt?: string;
  onUserPromptChange?: (value: string) => void;
  quickSettings?: CanvasSlideQuickSettings;
  onQuickSettingsChange?: (settings: CanvasSlideQuickSettings) => void;
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
    key: "transformMode",
    labelKey: "teamver.canvasSlideLaunch.quickTransform",
    options: [
      ["presentation", "teamver.canvasSlideLaunch.quickTransformPresentation"],
      ["faithful", "teamver.canvasSlideLaunch.quickTransformFaithful"],
      ["summary", "teamver.canvasSlideLaunch.quickTransformSummary"],
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

function formatUpdatedAt(raw: string | undefined): string | null {
  // Never fall back to revision ids — Date.parse fails and used to echo raw UUID/rev.
  return formatTeamverTimestampKst(raw, "ko");
}

function sourceHeadline(
  source: TeamverCanvasSlideLaunchSource,
  handoff: TeamverCanvasLaunchHandoff | null,
  untitled: string,
): string {
  if (source.kind === "drive") {
    return source.asset.filename?.trim() || source.asset.assetId;
  }
  return handoff?.title?.trim() || untitled;
}

function promptStepSummary(userPrompt: string, emptyLabel: string): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return emptyLabel;
  const oneLine = trimmed.replace(/\s+/g, " ");
  return oneLine.length > 72 ? `${oneLine.slice(0, 72)}…` : oneLine;
}

function buildWizardStepOrder(includeTemplateStep: boolean): CanvasSlideLaunchWizardStepId[] {
  return includeTemplateStep ? ["document", "prompt", "template"] : ["document", "prompt"];
}

export function TeamverCanvasSlideLaunchModal({
  open,
  source,
  confirming = false,
  errorMessage = null,
  onRelogin = null,
  templateOptions = [],
  templatesLoading = false,
  selectedTemplateId,
  onTemplateChange,
  userPrompt = "",
  onUserPromptChange,
  quickSettings = DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  onQuickSettingsChange,
  onConfirm,
  onClose,
}: Props) {
  const t = useTeamverT();
  const [liveHandoff, setLiveHandoff] = useState<TeamverCanvasLaunchHandoff | null>(
    source.kind === "canvas" ? source.handoff : null,
  );
  const [enriching, setEnriching] = useState(false);
  const [activeStepId, setActiveStepId] = useState<CanvasSlideLaunchWizardStepId>("document");
  // Once the template step has been shown for this open cycle, keep it so a
  // late empty settle cannot collapse 3→2 after the user already saw step 3.
  const [latchedTemplateStep, setLatchedTemplateStep] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

  const includeTemplateStep =
    templatesLoading || templateOptions.length > 1 || latchedTemplateStep;
  const wizardStepOrder = useMemo(
    () => buildWizardStepOrder(includeTemplateStep),
    [includeTemplateStep],
  );

  useEffect(() => {
    if (!open) {
      setLatchedTemplateStep(false);
      return;
    }
    if (templatesLoading || templateOptions.length > 1) {
      setLatchedTemplateStep(true);
    }
  }, [open, templatesLoading, templateOptions.length]);

  const resolvedActiveStepId: CanvasSlideLaunchWizardStepId = wizardStepOrder.includes(
    activeStepId,
  )
    ? activeStepId
    : (wizardStepOrder[0] ?? "document");

  useEffect(() => {
    if (resolvedActiveStepId !== activeStepId) {
      setActiveStepId(resolvedActiveStepId);
    }
  }, [activeStepId, resolvedActiveStepId]);

  useEffect(() => {
    if (!open || source.kind !== "canvas") {
      setLiveHandoff(null);
      setEnriching(false);
      return;
    }
    const base = source.handoff;
    setLiveHandoff(base);
    let cancelled = false;
    setEnriching(true);
    void fetchTeamverCanvasPreview(base)
      .then((live) => {
        if (cancelled || !live) return;
        setLiveHandoff(mergeCanvasLaunchHandoffPreview(base, live));
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, source]);

  useEffect(() => {
    if (!open) return;
    setActiveStepId("document");
  }, [open, source]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirming) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (confirming) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key === "Enter" && resolvedActiveStepId === "prompt") {
        const idx = wizardStepOrder.indexOf(resolvedActiveStepId);
        if (idx >= 0 && idx < wizardStepOrder.length - 1) {
          event.preventDefault();
          setActiveStepId(wizardStepOrder[idx + 1]!);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirming, onClose, open, resolvedActiveStepId, wizardStepOrder]);

  const untitled = t("teamver.canvasSlideLaunch.untitled");
  const handoff = source.kind === "canvas" ? liveHandoff ?? source.handoff : null;
  const headline = sourceHeadline(source, handoff, untitled);
  const isCanvas = source.kind === "canvas";
  const preview = isCanvas ? handoff?.preview?.trim() : "";
  const threadTitle = isCanvas ? handoff?.threadTitle?.trim() : "";
  const sectionCount = isCanvas ? handoff?.sectionCount : undefined;
  const headings = isCanvas ? handoff?.headings ?? [] : [];
  const updatedLabel = isCanvas
    ? formatUpdatedAt(handoff?.updatedAt)
      ?? (formatTeamverTimestampKst(handoff?.revision) ? formatUpdatedAt(handoff?.revision) : null)
    : null;
  const iconName =
    source.kind === "drive"
      ? driveImportAssetIconName(headline, source.asset.mimeType)
      : "file";

  const metaBits = useMemo(() => {
    const bits: string[] = [];
    if (threadTitle) bits.push(threadTitle);
    if (sectionCount != null && sectionCount > 0) {
      bits.push(t("teamver.canvasSlideLaunch.sections", { count: sectionCount }));
    }
    if (updatedLabel) {
      bits.push(t("teamver.canvasSlideLaunch.updated", { when: updatedLabel }));
    }
    return bits;
  }, [sectionCount, t, threadTitle, updatedLabel]);

  const showTitleSkeleton = isCanvas && enriching && !handoff?.title?.trim();
  const showPreviewSkeleton = isCanvas && enriching && !preview;
  const selectedTemplate =
    templateOptions.find((option) => option.id === selectedTemplateId)
    ?? (selectedTemplateId?.trim()
      ? { id: selectedTemplateId, title: selectedTemplateId, record: null }
      : templateOptions[0] ?? null);
  // Block confirm ONLY when the pick is a title===id stub (catalog miss /
  // still loading). Persisting the raw plugin id as selectedDeckTemplateTitle
  // poisons designSystem / visualTemplate inputs.
  //
  // Callers that omit templateOptions/selectedTemplateId (Drive flow with no
  // picker, embed tests) leave selectedTemplate null — there is nothing to
  // block in that case; confirm must proceed with the parent's fallback
  // create-slides binding.
  const selectedTemplateReady =
    !templatesLoading
    && (
      !selectedTemplate
      || selectedTemplate.id === CANVAS_CREATE_SLIDES_PLUGIN_ID
      || Boolean(selectedTemplate.record)
      || selectedTemplate.title.trim() !== selectedTemplate.id.trim()
    );
  const showTemplateGrid = includeTemplateStep;
  const stepDocumentTitle = t("teamver.canvasSlideLaunch.stepDocument");
  const stepPromptTitle = t("teamver.canvasSlideLaunch.stepPrompt");
  const stepTemplateTitle = t("teamver.canvasSlideLaunch.stepTemplate");
  const normalizedQuickSettings = {
    ...DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
    ...quickSettings,
  };

  const activeStepIndex = wizardStepOrder.indexOf(resolvedActiveStepId);
  const isLastWizardStep =
    activeStepIndex >= 0 && activeStepIndex === wizardStepOrder.length - 1;

  function updateQuickSetting<K extends keyof CanvasSlideQuickSettings>(
    key: K,
    value: CanvasSlideQuickSettings[K],
  ) {
    onQuickSettingsChange?.({
      ...normalizedQuickSettings,
      [key]: value,
    });
  }

  function goToStep(id: CanvasSlideLaunchWizardStepId) {
    setActiveStepId(id);
    if (id === "prompt") {
      queueMicrotask(() => promptInputRef.current?.focus({ preventScroll: true }));
    }
  }

  function goNext() {
    if (isLastWizardStep) return;
    goToStep(wizardStepOrder[activeStepIndex + 1]!);
  }

  function goBack() {
    if (activeStepIndex <= 0) return;
    goToStep(wizardStepOrder[activeStepIndex - 1]!);
  }

  const documentPanel = (
    <article
      className="teamver-canvas-slide-launch-card teamver-canvas-slide-launch-card--step"
      data-testid="teamver-canvas-slide-launch-source"
      data-enriching={enriching ? "1" : "0"}
    >
      <div className="teamver-canvas-slide-launch-card-top">
        <span className="teamver-canvas-slide-launch-source-icon" aria-hidden="true">
          <Icon name={iconName} size={20} />
        </span>
        <div className="teamver-canvas-slide-launch-card-copy">
          {showTitleSkeleton ? (
            <span
              className="teamver-canvas-slide-launch-skeleton teamver-canvas-slide-launch-skeleton-title"
              data-testid="teamver-canvas-slide-launch-skeleton"
            />
          ) : (
            <strong className="teamver-canvas-slide-launch-doc-title">{headline}</strong>
          )}
        </div>
      </div>

      {showPreviewSkeleton ? (
        <div className="teamver-canvas-slide-launch-skeleton-stack" aria-hidden="true">
          <span className="teamver-canvas-slide-launch-skeleton" />
          <span className="teamver-canvas-slide-launch-skeleton" />
        </div>
      ) : preview ? (
        <p
          className="teamver-canvas-slide-launch-preview"
          data-testid="teamver-canvas-slide-launch-preview"
        >
          {preview}
        </p>
      ) : null}

      {headings.length > 0 ? (
        <ol
          className="teamver-canvas-slide-launch-outline"
          data-testid="teamver-canvas-slide-launch-outline"
        >
          {headings.map((heading) => (
            <li key={heading}>{heading}</li>
          ))}
        </ol>
      ) : null}

      {metaBits.length > 0 ? (
        <ul className="teamver-canvas-slide-launch-meta" data-testid="teamver-canvas-slide-launch-meta">
          {metaBits.map((bit) => (
            <li key={bit}>{bit}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );

  const promptPanel = (
    <div className="teamver-canvas-slide-launch-prompt">
      <p className="teamver-canvas-slide-launch-prompt-lead">
        {t("teamver.canvasSlideLaunch.promptLead")}
      </p>
      <textarea
        ref={promptInputRef}
        className="teamver-canvas-slide-launch-prompt-input"
        rows={5}
        value={userPrompt}
        disabled={confirming}
        placeholder={t("teamver.canvasSlideLaunch.promptPlaceholder")}
        data-testid="teamver-canvas-slide-launch-prompt-input"
        aria-label={t("teamver.canvasSlideLaunch.promptLabel")}
        onChange={(event) => onUserPromptChange?.(event.currentTarget.value)}
      />
      <div
        className="teamver-canvas-slide-launch-quick-settings"
        data-testid="teamver-canvas-slide-launch-quick-settings"
      >
        <p className="teamver-canvas-slide-launch-quick-settings-title">
          {t("teamver.canvasSlideLaunch.quickSettingsTitle")}
        </p>
        {QUICK_SETTING_GROUPS.map((group) => (
          <div
            key={group.key}
            className="teamver-canvas-slide-launch-quick-group"
            data-testid={`teamver-canvas-slide-launch-quick-group-${group.key}`}
          >
            <span className="teamver-canvas-slide-launch-quick-label">
              {t(group.labelKey)}
            </span>
            <div className="teamver-canvas-slide-launch-quick-options">
              {group.options.map(([value, labelKey]) => {
                const selected = normalizedQuickSettings[group.key] === value;
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
                    data-testid={`teamver-canvas-slide-launch-quick-${group.key}-${value}`}
                    onClick={() => updateQuickSetting(group.key, value)}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const templatePanelInner = templatesLoading ? (
    <div
      className="teamver-canvas-slide-launch-template-skeleton"
      data-testid="teamver-canvas-slide-launch-template-skeleton"
      aria-busy="true"
      aria-label={t("teamver.canvasSlideLaunch.stepTemplate")}
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
  );

  const templatePanel = (
    <div className="teamver-canvas-slide-launch-template-section">
      {showTemplateGrid ? (
        <p
          className="teamver-canvas-slide-launch-template-lead"
          data-testid="teamver-canvas-slide-launch-template-lead"
        >
          {t("teamver.canvasSlideLaunch.templateLead")}
        </p>
      ) : null}
      {templatePanelInner}
    </div>
  );

  const wizardSteps: CanvasSlideLaunchWizardStep[] = [
    {
      id: "document",
      stepNumber: 1,
      title: stepDocumentTitle,
      panel: documentPanel,
    },
    {
      id: "prompt",
      stepNumber: 2,
      title: stepPromptTitle,
      optional: true,
      panel: promptPanel,
    },
    ...(includeTemplateStep
      ? [
          {
            id: "template" as const,
            stepNumber: 3,
            title: stepTemplateTitle,
            optional: true,
            panel: templatePanel,
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (resolvedActiveStepId === "prompt") {
        promptInputRef.current?.focus({ preventScroll: true });
      } else {
        closeButtonRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, resolvedActiveStepId]);

  const promptSummary = promptStepSummary(
    userPrompt,
    t("teamver.canvasSlideLaunch.promptEmptySummary"),
  );

  const footerContextLine =
    resolvedActiveStepId === "document"
      ? headline
      : resolvedActiveStepId === "prompt"
        ? promptSummary
        : selectedTemplate
          ? t("teamver.canvasSlideLaunch.footerTemplate", { name: selectedTemplate.title })
          : null;

  if (!open) return null;

  return (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onClose();
      }}
    >
      <section
        className={[
          "teamver-drive-picker-modal",
          "teamver-canvas-slide-launch-modal",
          showTemplateGrid ? "teamver-canvas-slide-launch-modal--wide" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-canvas-slide-launch-title"
        data-testid="teamver-canvas-slide-launch-modal"
        data-layout="wizard"
        data-wizard-steps={String(wizardStepOrder.length)}
      >
        <header className="teamver-canvas-slide-launch-head">
          <div className="teamver-canvas-slide-launch-kicker">
            <span className="teamver-canvas-slide-launch-badge" aria-hidden="true">
              <Icon name={iconName} size={14} />
            </span>
            <span>{t("teamver.canvasSlideLaunch.badge")}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="teamver-drive-picker-close"
            aria-label={t("teamver.canvasSlideLaunch.close")}
            disabled={confirming}
            data-testid="teamver-canvas-slide-launch-close"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="teamver-canvas-slide-launch-body">
          <h2 id="teamver-canvas-slide-launch-title" className="teamver-canvas-slide-launch-heading">
            {t("teamver.canvasSlideLaunch.title")}
          </h2>
          <p className="teamver-canvas-slide-launch-lead">
            {t("teamver.canvasSlideLaunch.description")}
          </p>

          <div className="teamver-canvas-slide-launch-flow teamver-canvas-slide-launch-flow--wizard">
            <CanvasSlideLaunchStepWizard
              steps={wizardSteps}
              activeStepId={resolvedActiveStepId}
              stepperAriaLabel={t("teamver.canvasSlideLaunch.stepperLabel")}
            />
          </div>

          {errorMessage ? (
            <p
              className="teamver-canvas-slide-launch-error"
              role="alert"
              data-testid="teamver-canvas-slide-launch-error"
            >
              {errorMessage}
              {onRelogin ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="teamver-drive-picker-empty__login"
                    data-testid="teamver-canvas-slide-launch-login"
                    disabled={confirming}
                    onClick={onRelogin}
                  >
                    다시 로그인
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <footer className="teamver-canvas-slide-launch-footer">
          <div
            className="teamver-canvas-slide-launch-footer-meta"
            data-testid="teamver-canvas-slide-launch-footer-meta"
          >
            {footerContextLine ? (
              <span
                className="teamver-canvas-slide-launch-footer-context"
                data-testid="teamver-canvas-slide-launch-footer-context"
                title={footerContextLine}
              >
                {footerContextLine}
              </span>
            ) : null}
            {selectedTemplate && (includeTemplateStep ? resolvedActiveStepId !== "template" : true) ? (
              <span
                className="teamver-canvas-slide-launch-footer-template"
                data-testid="teamver-canvas-slide-launch-footer-template"
                title={selectedTemplate.title}
              >
                {t("teamver.canvasSlideLaunch.footerTemplate", { name: selectedTemplate.title })}
              </span>
            ) : null}
            {!footerContextLine &&
            !(selectedTemplate && (includeTemplateStep ? resolvedActiveStepId !== "template" : true)) ? (
              <span className="teamver-canvas-slide-launch-footer-spacer" aria-hidden />
            ) : null}
          </div>
          <div className="teamver-canvas-slide-launch-footer-actions">
            {activeStepIndex > 0 ? (
              <button
                type="button"
                className="teamver-canvas-slide-launch-footer-back"
                disabled={confirming}
                data-testid="teamver-canvas-slide-launch-footer-back"
                onClick={goBack}
              >
                {t("teamver.canvasSlideLaunch.back")}
              </button>
            ) : null}
            {isLastWizardStep ? (
              <button
                type="button"
                className="teamver-drive-import-attach teamver-canvas-slide-launch-confirm"
                disabled={confirming || !selectedTemplateReady}
                data-testid="teamver-canvas-slide-launch-confirm"
                onClick={() => void onConfirm()}
              >
                {confirming
                  ? t("teamver.canvasSlideLaunch.working")
                  : !selectedTemplateReady
                    ? t("teamver.canvasSlideLaunch.working")
                    : errorMessage
                      ? t("teamver.canvasSlideLaunch.retry")
                      : t("teamver.canvasSlideLaunch.confirm")}
              </button>
            ) : (
              <button
                type="button"
                className="teamver-drive-import-attach teamver-canvas-slide-launch-footer-next"
                disabled={confirming}
                data-testid="teamver-canvas-slide-launch-footer-next"
                onClick={goNext}
              >
                {t("teamver.canvasSlideLaunch.next")}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
