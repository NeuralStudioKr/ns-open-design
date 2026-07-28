import type { ReactNode } from "react";
import { CanvasSlideLaunchStepHeading } from "./CanvasSlideLaunchStepHeading";

export type CanvasSlideLaunchWizardStepId = "document" | "prompt" | "template";

export type CanvasSlideLaunchWizardStep = {
  id: CanvasSlideLaunchWizardStepId;
  stepNumber: number;
  title: string;
  optional?: boolean;
  panel: ReactNode;
};

type Props = {
  steps: CanvasSlideLaunchWizardStep[];
  activeStepId: CanvasSlideLaunchWizardStepId;
  stepperAriaLabel: string;
};

/**
 * Step indicator + single visible panel (안 A). Navigation is via footer prev/next.
 */
export function CanvasSlideLaunchStepWizard({ steps, activeStepId, stepperAriaLabel }: Props) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = steps[activeIndex] ?? steps[0];

  return (
    <div
      className="teamver-canvas-slide-launch-wizard"
      data-testid="teamver-canvas-slide-launch-wizard"
    >
      <nav
        className="teamver-canvas-slide-launch-stepper"
        aria-label={stepperAriaLabel}
        data-testid="teamver-canvas-slide-launch-stepper"
      >
        <ol className="teamver-canvas-slide-launch-stepper-list">
          {steps.map((step, index) => {
            const status =
              index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
            return (
              <li
                key={step.id}
                className={[
                  "teamver-canvas-slide-launch-stepper-item",
                  `is-${status}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-testid={`teamver-canvas-slide-launch-stepper-${step.id}`}
                aria-current={status === "current" ? "step" : undefined}
              >
                <span className="teamver-canvas-slide-launch-stepper-index" aria-hidden>
                  {step.stepNumber}
                </span>
                <CanvasSlideLaunchStepHeading title={step.title} optional={step.optional} />
              </li>
            );
          })}
        </ol>
      </nav>

      <div
        className="teamver-canvas-slide-launch-wizard-panel"
        data-testid={`teamver-canvas-slide-launch-wizard-panel-${activeStep?.id ?? "document"}`}
      >
        {activeStep?.panel}
      </div>
    </div>
  );
}
