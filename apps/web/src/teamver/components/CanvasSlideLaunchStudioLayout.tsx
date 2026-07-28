import type { ReactNode } from "react";

type Props = {
  documentPanel: ReactNode;
  promptPanel: ReactNode;
  templatePanel: ReactNode;
  documentTitle: string;
  promptTitle: string;
  templateTitle: string;
};

/**
 * Desktop "studio" layout for Canvas → Design launch (wide modal only).
 *
 * Left rail: source document + prompt (always visible, scrolls together if
 * tall). Right rail: template gallery with its own scroll — intentional
 * master/detail split so users can read the doc and browse templates without
 * the old "modal scroll + grid scroll" trap in one column.
 *
 * Visibility is toggled from CSS (`flow--studio` inside `--wide` modal at
 * min-width 720px); mobile keeps the step accordion instead.
 */
export function CanvasSlideLaunchStudioLayout({
  documentPanel,
  promptPanel,
  templatePanel,
  documentTitle,
  promptTitle,
  templateTitle,
}: Props) {
  return (
    <div
      className="teamver-canvas-slide-launch-studio"
      data-testid="teamver-canvas-slide-launch-studio"
    >
      <div className="teamver-canvas-slide-launch-studio-main">
        <section
          className="teamver-canvas-slide-launch-studio-block"
          aria-labelledby="teamver-canvas-slide-launch-studio-doc-label"
        >
          <h3
            id="teamver-canvas-slide-launch-studio-doc-label"
            className="teamver-canvas-slide-launch-studio-label"
          >
            <span className="teamver-canvas-slide-launch-studio-step" aria-hidden>
              1
            </span>
            {documentTitle}
          </h3>
          {documentPanel}
        </section>
        <section
          className="teamver-canvas-slide-launch-studio-block"
          aria-labelledby="teamver-canvas-slide-launch-studio-prompt-label"
        >
          <h3
            id="teamver-canvas-slide-launch-studio-prompt-label"
            className="teamver-canvas-slide-launch-studio-label"
          >
            <span className="teamver-canvas-slide-launch-studio-step" aria-hidden>
              2
            </span>
            {promptTitle}
          </h3>
          {promptPanel}
        </section>
      </div>
      <aside
        className="teamver-canvas-slide-launch-studio-aside"
        aria-labelledby="teamver-canvas-slide-launch-studio-template-label"
      >
        <h3
          id="teamver-canvas-slide-launch-studio-template-label"
          className="teamver-canvas-slide-launch-studio-label teamver-canvas-slide-launch-studio-label--aside"
        >
          <span className="teamver-canvas-slide-launch-studio-step" aria-hidden>
            3
          </span>
          {templateTitle}
        </h3>
        {templatePanel}
      </aside>
    </div>
  );
}
