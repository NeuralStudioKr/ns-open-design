// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders canvas title, preview, and meta instead of raw artifact id", () => {
    const onConfirm = vi.fn();
    render(
      <TeamverCanvasSlideLaunchModal
        open
        source={{
          kind: "canvas",
          handoff: {
            sessionId: "s1",
            artifactId: "artifact-12345678",
            title: "Q3 기획 요약",
            preview: "이번 분기 목표는 온보딩 전환율을 올리는 것입니다.",
            sectionCount: 4,
            updatedAt: "2026-07-15T09:09:19.819370",
          },
        }}
        errorMessage="too large"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Q3 기획 요약")).toBeTruthy();
    expect(screen.getByTestId("teamver-canvas-slide-launch-preview").textContent).toContain(
      "온보딩 전환율",
    );
    expect(screen.getByTestId("teamver-canvas-slide-launch-meta").textContent).toContain(
      "sections 4",
    );
    expect(screen.queryByText(/canvas\/artifact/)).toBeNull();
    expect(screen.getByTestId("teamver-canvas-slide-launch-error").textContent).toBe("too large");
    expect(screen.getByTestId("teamver-canvas-slide-launch-confirm").textContent).toBe(
      "teamver.canvasSlideLaunch.retry",
    );
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
});
