// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamverCanvasSlideLaunchModal } from "../src/teamver/components/TeamverCanvasSlideLaunchModal";

vi.mock("../src/i18n", () => ({
  useT: () => (key: string) => key,
}));

describe("TeamverCanvasSlideLaunchModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders source asset and confirms in one action", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        asset={{ assetId: "AST-1", filename: "canvas-export.html", mimeType: "text/html" }}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId("teamver-canvas-slide-launch-modal")).toBeTruthy();
    expect(screen.getByText("canvas-export.html")).toBeTruthy();
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes from cancel without confirming", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <TeamverCanvasSlideLaunchModal
        open
        asset={{ assetId: "AST-2", filename: "deck.html" }}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText("teamver.canvasSlideLaunch.cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
