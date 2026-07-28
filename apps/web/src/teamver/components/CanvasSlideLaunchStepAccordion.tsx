import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";

export type CanvasSlideLaunchStepId = "document" | "prompt" | "template";

type StepConfig = {
  id: CanvasSlideLaunchStepId;
  stepNumber: number;
  title: string;
  /** One-line preview when the panel is collapsed. */
  summary?: string | null;
  panel: ReactNode;
};

type Props = {
  steps: StepConfig[];
  expandedStep: CanvasSlideLaunchStepId;
  onExpandedStepChange: (id: CanvasSlideLaunchStepId) => void;
  disabled?: boolean;
};

/**
 * Single-expand step list for the Canvas → Design launch modal.
 * Only one step panel is open at a time so the modal keeps a single outer
 * scroll surface (no nested template grid scroll).
 */
export function CanvasSlideLaunchStepAccordion({
  steps,
  expandedStep,
  onExpandedStepChange,
  disabled = false,
}: Props) {
  return (
    <div
      className="teamver-canvas-slide-launch-steps"
      data-testid="teamver-canvas-slide-launch-steps"
    >
      {steps.map((step) => {
        const expanded = step.id === expandedStep;
        return (
          <section
            key={step.id}
            className={[
              "teamver-canvas-slide-launch-step",
              expanded ? "is-expanded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid={`teamver-canvas-slide-launch-step-${step.id}`}
            data-expanded={expanded ? "true" : "false"}
          >
            <button
              type="button"
              className="teamver-canvas-slide-launch-step-trigger"
              aria-expanded={expanded}
              aria-controls={`teamver-canvas-slide-launch-step-panel-${step.id}`}
              disabled={disabled}
              data-testid={`teamver-canvas-slide-launch-step-trigger-${step.id}`}
              onClick={() => onExpandedStepChange(step.id)}
            >
              <span className="teamver-canvas-slide-launch-step-index" aria-hidden>
                {step.stepNumber}
              </span>
              <span className="teamver-canvas-slide-launch-step-headings">
                <span className="teamver-canvas-slide-launch-step-title">{step.title}</span>
                {!expanded && step.summary?.trim() ? (
                  <span className="teamver-canvas-slide-launch-step-summary">{step.summary}</span>
                ) : null}
              </span>
              <Icon
                name="chevron-down"
                size={14}
                className={[
                  "teamver-canvas-slide-launch-step-chevron",
                  expanded ? "is-expanded" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div
                id={`teamver-canvas-slide-launch-step-panel-${step.id}`}
                className="teamver-canvas-slide-launch-step-panel"
                data-testid={`teamver-canvas-slide-launch-step-panel-${step.id}`}
              >
                {step.panel}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
