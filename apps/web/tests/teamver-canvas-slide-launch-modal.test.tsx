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

describe("TeamverCanvasSlideLaunchModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders drive source asset and confirms in one action", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{
          kind: "drive",
          asset: { assetId: "AST-1", filename: "canvas-export.html", mimeType: "text/html" },
        }}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-modal")).toBeTruthy();
    expect(screen.getByText("canvas-export.html")).toBeTruthy();
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
      expect(screen.getByText("Live 제목")).toBeTruthy();
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

  it("closes from cancel without confirming", () => {
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

    fireEvent.click(screen.getByText("teamver.canvasSlideLaunch.cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("lets the user choose a slide template via the visual card grid", () => {
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

    const grid = screen.getByTestId("teamver-canvas-slide-launch-template");
    expect(grid.getAttribute("role")).toBe("radiogroup");
    const hermesCard = screen.getByTestId(
      "teamver-canvas-slide-launch-template-card-html-ppt-hermes",
    );
    expect(hermesCard.getAttribute("role")).toBe("radio");
    fireEvent.click(hermesCard);
    expect(onTemplateChange).toHaveBeenCalledWith("html-ppt-hermes");
  });

  it("renders a single-option picker as a static label (no grid)", () => {
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

    const picker = screen.getByTestId("teamver-canvas-slide-launch-template");
    expect(picker.getAttribute("role")).not.toBe("radiogroup");
    expect(picker.textContent).toContain("기본 슬라이드 템플릿");
    expect(
      screen.queryByTestId(
        "teamver-canvas-slide-launch-template-card-example-simple-deck",
      ),
    ).toBeNull();
  });
});
