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
  DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  type CanvasSlideQuickSettings,
  type TeamverCanvasSlideTemplateOption,
} from "../canvasSlideLaunch";
import { CanvasSlideTemplatePicker } from "./CanvasSlideTemplatePicker";
import {
  CanvasSlideLaunchStepAccordion,
  type CanvasSlideLaunchStepId,
} from "./CanvasSlideLaunchStepAccordion";
import { CanvasSlideLaunchStudioLayout } from "./CanvasSlideLaunchStudioLayout";
import { useCanvasSlideLaunchWideLayout } from "../hooks/useCanvasSlideLaunchWideLayout";

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

function formatUpdatedAt(raw: string | undefined, locale: string): string | null {
  if (!raw?.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw.trim();
  try {
    return new Intl.DateTimeFormat(locale || "ko", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return raw.trim();
  }
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

export function TeamverCanvasSlideLaunchModal({
  open,
  source,
  confirming = false,
  errorMessage = null,
  onRelogin = null,
  templateOptions = [],
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
  const [expandedStep, setExpandedStep] = useState<CanvasSlideLaunchStepId>("document");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    setExpandedStep("document");
  }, [open, source]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirming) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirming, onClose, open]);

  const untitled = t("teamver.canvasSlideLaunch.untitled");
  const handoff = source.kind === "canvas" ? liveHandoff ?? source.handoff : null;
  const headline = sourceHeadline(source, handoff, untitled);
  const isCanvas = source.kind === "canvas";
  const preview = isCanvas ? handoff?.preview?.trim() : "";
  const threadTitle = isCanvas ? handoff?.threadTitle?.trim() : "";
  const sectionCount = isCanvas ? handoff?.sectionCount : undefined;
  const headings = isCanvas ? handoff?.headings ?? [] : [];
  const updatedLabel = isCanvas
    ? formatUpdatedAt(handoff?.updatedAt || handoff?.revision, "ko")
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
    templateOptions.find((option) => option.id === selectedTemplateId) ?? templateOptions[0] ?? null;
  const showTemplateGrid = templateOptions.length > 1;
  const useStudioLayout = useCanvasSlideLaunchWideLayout(showTemplateGrid);
  const normalizedQuickSettings = {
    ...DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
    ...quickSettings,
  };

  function updateQuickSetting<K extends keyof CanvasSlideQuickSettings>(
    key: K,
    value: CanvasSlideQuickSettings[K],
  ) {
    onQuickSettingsChange?.({
      ...normalizedQuickSettings,
      [key]: value,
    });
  }

  const renderDocumentPanel = (includeStepNav: boolean) => (
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

      {includeStepNav ? (
        <div className="teamver-canvas-slide-launch-step-actions">
          <button
            type="button"
            className="teamver-canvas-slide-launch-step-next"
            disabled={confirming}
            data-testid="teamver-canvas-slide-launch-next-prompt"
            onClick={() => {
              setExpandedStep("prompt");
              queueMicrotask(() => promptInputRef.current?.focus());
            }}
          >
            {t("teamver.canvasSlideLaunch.nextPrompt")}
          </button>
        </div>
      ) : null}
    </article>
  );

  const renderPromptPanel = (includeStepNav: boolean) => (
    <div className="teamver-canvas-slide-launch-prompt">
      <p className="teamver-canvas-slide-launch-prompt-lead">
        {t("teamver.canvasSlideLaunch.promptLead")}
      </p>
      <textarea
        ref={promptInputRef}
        className="teamver-canvas-slide-launch-prompt-input"
        rows={useStudioLayout ? 5 : 4}
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
      {includeStepNav ? (
        <div className="teamver-canvas-slide-launch-step-actions">
          <button
            type="button"
            className="teamver-canvas-slide-launch-step-next"
            disabled={confirming}
            data-testid="teamver-canvas-slide-launch-next-template"
            onClick={() => setExpandedStep("template")}
          >
            {t("teamver.canvasSlideLaunch.nextTemplate")}
          </button>
        </div>
      ) : null}
    </div>
  );

  const templatePanel =
    templateOptions.length > 0 ? (
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

  const steps = [
    {
      id: "document" as const,
      stepNumber: 1,
      title: t("teamver.canvasSlideLaunch.stepDocument"),
      summary: headline,
      panel: renderDocumentPanel(true),
    },
    {
      id: "prompt" as const,
      stepNumber: 2,
      title: t("teamver.canvasSlideLaunch.stepPrompt"),
      summary: promptStepSummary(userPrompt, t("teamver.canvasSlideLaunch.promptEmptySummary")),
      panel: renderPromptPanel(true),
    },
    {
      id: "template" as const,
      stepNumber: 3,
      title: t("teamver.canvasSlideLaunch.stepTemplate"),
      summary: selectedTemplate?.title ?? t("teamver.canvasSlideLaunch.templateFallback"),
      panel: templatePanel,
    },
  ];

  useEffect(() => {
    if (!open) return;
    const el = closeButtonRef.current;
    if (!el && !promptInputRef.current) return;
    const id = requestAnimationFrame(() => {
      if (useStudioLayout) {
        promptInputRef.current?.focus({ preventScroll: true });
      } else {
        el?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, useStudioLayout]);

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
        data-layout={
          showTemplateGrid ? (useStudioLayout ? "studio" : "accordion") : "compact"
        }
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
            aria-label={t("teamver.canvasSlideLaunch.cancel")}
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

          {!showTemplateGrid ? (
            <div
              className="teamver-canvas-slide-launch-flow teamver-canvas-slide-launch-flow--compact"
              data-testid="teamver-canvas-slide-launch-flow-compact"
            >
              <div className="teamver-canvas-slide-launch-compact-section">
                <h3 className="teamver-canvas-slide-launch-compact-label">
                  {t("teamver.canvasSlideLaunch.stepDocument")}
                </h3>
                {renderDocumentPanel(false)}
              </div>
              <div className="teamver-canvas-slide-launch-compact-section">
                <h3 className="teamver-canvas-slide-launch-compact-label">
                  {t("teamver.canvasSlideLaunch.stepPrompt")}
                </h3>
                {renderPromptPanel(false)}
              </div>
              {templateOptions.length > 0 ? (
                <div className="teamver-canvas-slide-launch-compact-section">
                  <h3 className="teamver-canvas-slide-launch-compact-label">
                    {t("teamver.canvasSlideLaunch.stepTemplate")}
                  </h3>
                  {templatePanel}
                </div>
              ) : null}
            </div>
          ) : useStudioLayout ? (
            <div className="teamver-canvas-slide-launch-flow teamver-canvas-slide-launch-flow--studio">
              <CanvasSlideLaunchStudioLayout
                documentTitle={t("teamver.canvasSlideLaunch.stepDocument")}
                promptTitle={t("teamver.canvasSlideLaunch.stepPrompt")}
                templateTitle={t("teamver.canvasSlideLaunch.stepTemplate")}
                documentPanel={renderDocumentPanel(false)}
                promptPanel={renderPromptPanel(false)}
                templatePanel={templatePanel}
              />
            </div>
          ) : (
            <div className="teamver-canvas-slide-launch-flow teamver-canvas-slide-launch-flow--stack">
              <CanvasSlideLaunchStepAccordion
                steps={steps}
                expandedStep={expandedStep}
                disabled={confirming}
                onExpandedStepChange={setExpandedStep}
              />
            </div>
          )}

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
          {selectedTemplate ? (
            <span
              className="teamver-canvas-slide-launch-footer-template"
              data-testid="teamver-canvas-slide-launch-footer-template"
              title={selectedTemplate.title}
            >
              {t("teamver.canvasSlideLaunch.footerTemplate", { name: selectedTemplate.title })}
            </span>
          ) : (
            <span className="teamver-canvas-slide-launch-footer-spacer" aria-hidden />
          )}
          <div className="teamver-canvas-slide-launch-footer-actions">
          <button
            type="button"
            className="teamver-drive-import-cancel"
            disabled={confirming}
            onClick={onClose}
          >
            {t("teamver.canvasSlideLaunch.cancel")}
          </button>
          <button
            type="button"
            className="teamver-drive-import-attach teamver-canvas-slide-launch-confirm"
            disabled={confirming}
            data-testid="teamver-canvas-slide-launch-confirm"
            onClick={() => void onConfirm()}
          >
            {confirming
              ? t("teamver.canvasSlideLaunch.working")
              : errorMessage
                ? t("teamver.canvasSlideLaunch.retry")
                : t("teamver.canvasSlideLaunch.confirm")}
          </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
