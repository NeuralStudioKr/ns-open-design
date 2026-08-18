// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamverCanvasSlideLaunchModal } from "../src/teamver/components/TeamverCanvasSlideLaunchModal";

vi.mock("../src/teamver/branding/useTeamverT", () => ({
  useTeamverT: () => (key: string, vars?: Record<string, string | number>) => {
    if (key === "teamver.canvasSlideLaunch.sections" && vars?.count != null) {
      return `sections ${vars.count}`;
    }
    if (key === "teamver.canvasSlideLaunch.updated" && vars?.when != null) {
      return `updated ${vars.when}`;
    }
    if (key === "teamver.canvasSlideLaunch.footerTemplate" && vars?.name != null) {
      return `template:${vars.name}`;
    }
    if (key === "teamver.canvasSlideLaunch.untitled") return "Untitled document";
    return key;
  },
}));

vi.mock("../src/teamver/fetchCanvasPreview", () => ({
  fetchTeamverCanvasPreview: vi.fn(async () => ({
    sessionId: "s1",
    artifactId: "artifact-12345678",
    title: "Live 제목",
    preview: "서버에서 보강한 미리보기",
    threadTitle: "기획 스레드",
    sectionCount: 3,
    headings: ["목표", "일정", "리스크"],
    updatedAt: "2026-07-15T09:09:19.819370",
  })),
}));

function advanceToConfirm(options?: { templateSteps?: number }) {
  const steps = options?.templateSteps ?? 2;
  if (steps >= 2) {
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
  }
  if (steps >= 3) {
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
  }
}

describe("TeamverCanvasSlideLaunchModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses wizard layout and confirms from the last step only", () => {
    const onConfirm = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{
          kind: "drive",
          asset: { assetId: "AST-1", filename: "canvas-export.html", mimeType: "text/html" },
        }}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const modal = screen.getByTestId("teamver-canvas-slide-launch-modal");
    expect(modal.getAttribute("data-layout")).toBe("wizard");
    expect(screen.getByTestId("teamver-canvas-slide-launch-wizard")).toBeTruthy();
    expect(screen.queryByTestId("teamver-canvas-slide-launch-confirm")).toBeNull();

    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("enriches canvas handoff with live preview outline and thread", async () => {
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{
          kind: "canvas",
          handoff: {
            sessionId: "s1",
            artifactId: "artifact-12345678",
            title: "URL 제목",
            preview: "URL 미리보기",
          },
        }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("teamver-canvas-slide-launch-source").textContent,
      ).toContain("Live 제목");
    });
    expect(screen.getByTestId("teamver-canvas-slide-launch-preview").textContent).toContain(
      "서버에서 보강",
    );
    expect(screen.getByTestId("teamver-canvas-slide-launch-outline").textContent).toContain("목표");
    expect(screen.getByTestId("teamver-canvas-slide-launch-meta").textContent).toContain(
      "기획 스레드",
    );
    expect(screen.queryByText(/canvas\/artifact/)).toBeNull();
  });

  it("closes from header X without a footer cancel button", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-2", filename: "deck.html" } }}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.queryByText("teamver.canvasSlideLaunch.cancel")).toBeNull();
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("lets the user choose a slide template on step 3 of the wizard", () => {
    const onTemplateChange = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-3", filename: "canvas.html" } }}
        templateOptions={[
          { id: "example-simple-deck", title: "기본 슬라이드" },
          { id: "html-ppt-hermes", title: "Hermes Cyber Terminal" },
        ]}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={onTemplateChange}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    advanceToConfirm({ templateSteps: 3 });

    const grid = screen.getByTestId("teamver-canvas-slide-launch-template");
    expect(grid.getAttribute("role")).toBe("radiogroup");
    fireEvent.click(
      screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes"),
    );
    expect(onTemplateChange).toHaveBeenCalledWith("html-ppt-hermes");
  });

  it("walks document → prompt → template with optional badges on steps 2–3", () => {
    const onUserPromptChange = vi.fn();
    const onQuickSettingsChange = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-flow", filename: "lesson.html" } }}
        templateOptions={[
          { id: "example-simple-deck", title: "기본 슬라이드" },
          { id: "html-ppt-hermes", title: "Hermes" },
        ]}
        selectedTemplateId="example-simple-deck"
        userPrompt=""
        onUserPromptChange={onUserPromptChange}
        onQuickSettingsChange={onQuickSettingsChange}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-stepper-document")).toBeTruthy();
    expect(screen.getByTestId("teamver-canvas-slide-launch-stepper-prompt").textContent).toContain(
      "teamver.canvasSlideLaunch.stepOptionalBadge",
    );
    expect(
      screen.getByTestId("teamver-canvas-slide-launch-stepper-template").textContent,
    ).toContain("teamver.canvasSlideLaunch.stepOptionalBadge");
    expect(screen.getByTestId("teamver-canvas-slide-launch-source").textContent).toContain(
      "lesson.html",
    );
    expect(screen.queryByTestId("teamver-canvas-slide-launch-prompt-input")).toBeNull();

    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
    const input = screen.getByTestId("teamver-canvas-slide-launch-prompt-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "첫 수업용 8장" } });
    expect(onUserPromptChange).toHaveBeenCalledWith("첫 수업용 8장");

    expect(screen.getByTestId("teamver-canvas-slide-launch-quick-settings")).toBeTruthy();
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-quick-audience-education"));
    expect(onQuickSettingsChange).toHaveBeenCalledWith({
      audience: "education",
      length: "auto",
      transformMode: "presentation",
      tone: "auto",
      language: "auto",
    });

    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-back"));
    expect(screen.getByTestId("teamver-canvas-slide-launch-source").textContent).toContain(
      "lesson.html",
    );
  });

  it("closes on Escape and moves initial focus to the close affordance", async () => {
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-esc", filename: "canvas.html" } }}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );

    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const closeButton = screen.getByTestId("teamver-canvas-slide-launch-close");
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close on Escape while a confirm is in flight (prevents accidental cancel mid-run)", () => {
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        confirming
        source={{ kind: "drive", asset: { assetId: "AST-lock", filename: "canvas.html" } }}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByTestId("teamver-canvas-slide-launch-close") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("marks the default 기본 슬라이드 템플릿 card with a visible badge", () => {
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-def", filename: "canvas.html" } }}
        templateOptions={[
          { id: "example-simple-deck", title: "기본 슬라이드 템플릿" },
          { id: "html-ppt-hermes", title: "Hermes" },
        ]}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    advanceToConfirm({ templateSteps: 3 });

    const badge = screen.getByTestId(
      "teamver-canvas-slide-launch-template-card-default-badge-example-simple-deck",
    );
    expect(badge.textContent).toContain("기본");
    expect(
      screen.queryByTestId(
        "teamver-canvas-slide-launch-template-card-default-badge-html-ppt-hermes",
      ),
    ).toBeNull();
  });

  it("A-1: single template skips step 3 and shows a static picker on step 2", () => {
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-4", filename: "canvas.html" } }}
        templateOptions={[{ id: "example-simple-deck", title: "기본 슬라이드 템플릿" }]}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-modal").getAttribute("data-wizard-steps")).toBe(
      "2",
    );
    expect(screen.queryByTestId("teamver-canvas-slide-launch-stepper-template")).toBeNull();

    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
    expect(screen.getByTestId("teamver-canvas-slide-launch-footer-template").textContent).toContain(
      "기본 슬라이드 템플릿",
    );
    expect(screen.getByTestId("teamver-canvas-slide-launch-confirm")).toBeTruthy();
  });

  it("reserves the template wizard step with a skeleton while templates load", () => {
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-loading", filename: "canvas.html" } }}
        templateOptions={[{ id: "example-simple-deck", title: "기본 슬라이드 템플릿" }]}
        templatesLoading
        selectedTemplateId="example-simple-deck"
        onTemplateChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-modal").getAttribute("data-wizard-steps")).toBe(
      "3",
    );
    expect(screen.getByTestId("teamver-canvas-slide-launch-modal").className).toContain(
      "teamver-canvas-slide-launch-modal--wide",
    );
    expect(screen.getByTestId("teamver-canvas-slide-launch-stepper-template")).toBeTruthy();

    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-footer-next"));
    expect(screen.getByTestId("teamver-canvas-slide-launch-template-skeleton")).toBeTruthy();
    expect(
      (screen.getByTestId("teamver-canvas-slide-launch-confirm") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("uses wide wizard on multi-template launches (studio layout removed)", () => {
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{ kind: "drive", asset: { assetId: "AST-wide", filename: "lesson.html" } }}
        templateOptions={[
          { id: "example-simple-deck", title: "기본" },
          { id: "html-ppt-hermes", title: "Hermes" },
        ]}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-modal").className).toContain(
      "teamver-canvas-slide-launch-modal--wide",
    );
    expect(screen.queryByTestId("teamver-canvas-slide-launch-studio")).toBeNull();

    advanceToConfirm({ templateSteps: 3 });
    expect(
      screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes"),
    ).toBeTruthy();
    expect(screen.getByTestId("teamver-canvas-slide-launch-footer-context").textContent).toContain(
      "template:Hermes",
    );
  });
});
