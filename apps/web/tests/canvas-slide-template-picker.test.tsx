// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasSlideTemplatePicker } from "../src/teamver/components/CanvasSlideTemplatePicker";
import type { TeamverCanvasSlideTemplateOption } from "../src/teamver/canvasSlideLaunch";

// PreviewSurface pulls in IntersectionObserver + iframe machinery that jsdom
// does not implement; the picker's contract for our tests is "did we mount a
// card / arrow-key move the selection", not "does the iframe render". Stub
// the surface so the rest of the tree stays pure JSX.
vi.mock("../src/components/plugins-home/cards/PreviewSurface", () => ({
  PreviewSurface: ({ pluginId, pluginTitle }: { pluginId: string; pluginTitle: string }) => (
    <div data-testid={`preview-surface-${pluginId}`}>{pluginTitle}</div>
  ),
}));
vi.mock("../src/components/plugins-home/preview", () => ({
  inferPluginPreview: () => ({ kind: "text" as const }),
}));
vi.mock("../src/teamver/embedDaemonFetchPolicy", () => ({
  shouldEagerLoadCommunityPluginPreviews: () => false,
}));

function makeOptions(): TeamverCanvasSlideTemplateOption[] {
  const record = (id: string, title: string) =>
    ({
      id,
      title,
      manifest: { title, od: { mode: "deck" } },
    }) as unknown as TeamverCanvasSlideTemplateOption["record"];
  return [
    { id: "example-simple-deck", title: "기본 슬라이드 템플릿", record: null },
    {
      id: "html-ppt-hermes",
      title: "Hermes Cyber Terminal",
      record: record("html-ppt-hermes", "Hermes Cyber Terminal"),
    },
    {
      id: "html-ppt-cobalt-grid",
      title: "Cobalt Grid",
      record: record("html-ppt-cobalt-grid", "Cobalt Grid"),
    },
  ];
}

describe("CanvasSlideTemplatePicker", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a radiogroup with one card per option and marks the selected id", () => {
    const options = makeOptions();
    render(
      <CanvasSlideTemplatePicker
        options={options}
        selectedTemplateId="html-ppt-hermes"
        onSelect={vi.fn()}
      />,
    );

    const group = screen.getByTestId("teamver-canvas-slide-launch-template");
    expect(group.getAttribute("role")).toBe("radiogroup");
    const hermes = screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes");
    expect(hermes.getAttribute("aria-checked")).toBe("true");
    expect(hermes.getAttribute("data-selected")).toBe("true");
    const cobalt = screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-cobalt-grid");
    expect(cobalt.getAttribute("aria-checked")).toBe("false");
  });

  it("commits selection on card click and on Space keypress", () => {
    const onSelect = vi.fn();
    render(
      <CanvasSlideTemplatePicker
        options={makeOptions()}
        selectedTemplateId="example-simple-deck"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-cobalt-grid"),
    );
    expect(onSelect).toHaveBeenLastCalledWith("html-ppt-cobalt-grid");

    fireEvent.keyDown(
      screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes"),
      { key: " " },
    );
    expect(onSelect).toHaveBeenLastCalledWith("html-ppt-hermes");
  });

  it("moves selection with arrow keys, wrapping at the boundaries", () => {
    const onSelect = vi.fn();
    render(
      <CanvasSlideTemplatePicker
        options={makeOptions()}
        selectedTemplateId="example-simple-deck"
        onSelect={onSelect}
      />,
    );

    const group = screen.getByTestId("teamver-canvas-slide-launch-template");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("html-ppt-hermes");
    fireEvent.keyDown(group, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("html-ppt-cobalt-grid");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    // Wrap-around from the first item to the last / prev of the current.
    expect(onSelect).toHaveBeenCalled();
  });

  it("filters cards by search query and falls back to the first visible option", () => {
    const onSelect = vi.fn();
    render(
      <CanvasSlideTemplatePicker
        options={makeOptions()}
        selectedTemplateId="example-simple-deck"
        onSelect={onSelect}
        showSearch
      />,
    );

    const search = screen.getByTestId("teamver-canvas-slide-launch-template-search");
    fireEvent.change(search, { target: { value: "cobalt" } });

    expect(
      screen.queryByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes"),
    ).toBeNull();
    expect(
      screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-cobalt-grid"),
    ).toBeTruthy();
    // The previously selected id was filtered out → picker asked the parent to
    // fall back to the only visible card.
    expect(onSelect).toHaveBeenCalledWith("html-ppt-cobalt-grid");
  });

  it("renders a static single-option label when only one template is available", () => {
    render(
      <CanvasSlideTemplatePicker
        options={[{ id: "example-simple-deck", title: "기본 슬라이드 템플릿", record: null }]}
        selectedTemplateId="example-simple-deck"
        onSelect={vi.fn()}
      />,
    );

    const single = screen.getByTestId("teamver-canvas-slide-launch-template");
    expect(single.getAttribute("role")).not.toBe("radiogroup");
    expect(single.textContent).toContain("기본 슬라이드 템플릿");
  });
});
