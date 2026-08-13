// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TeamverHomeSlideCreateModal } from "../src/teamver/components/TeamverHomeSlideCreateModal";
import { TeamverHomeCreateHero } from "../src/teamver/components/TeamverHomeCreateHero";
import { I18nProvider } from "../src/i18n";

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

afterEach(() => cleanup());

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="en">{ui}</I18nProvider>);
}

describe("TeamverHomeCreateHero", () => {
  it("renders single CTA", () => {
    const onCreate = vi.fn();
    wrap(<TeamverHomeCreateHero onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId("teamver-home-create-cta"));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByTestId("teamver-home-create-cta").textContent).toMatch(/New slide/i);
  });
});

describe("TeamverHomeSlideCreateModal", () => {
  const templates = [
    { id: "html-ppt-hermes", title: "Hermes", record: null },
    { id: "example-simple-deck", title: "Default", record: null },
  ];

  it("new entry: content then template, confirm label has no template name", () => {
    const onConfirm = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-next"));
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
    const confirm = screen.getByTestId("teamver-home-slide-create-confirm");
    expect(confirm.textContent).toContain("Create slides");
    expect(confirm.textContent).not.toContain("Hermes");
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("template entry: content with step2 complete and confirm available", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="template"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    expect(screen.getByTestId("teamver-home-slide-create-confirm")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-next")).toBeNull();
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-step-template"));
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
  });

  it("uses a short placeholder and no tip chrome", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-prompt").getAttribute("placeholder")).toMatch(
      /topic and key messages/i,
    );
    expect(screen.queryByTestId("teamver-home-slide-create-tip-btn")).toBeNull();
    expect(screen.queryByTestId("teamver-home-slide-create-tips")).toBeNull();
  });
});
