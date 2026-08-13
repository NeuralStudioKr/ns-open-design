// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TeamverHomeSlideCreateModal } from "../src/teamver/components/TeamverHomeSlideCreateModal";
import { TeamverHomeCreateHero } from "../src/teamver/components/TeamverHomeCreateHero";
import {
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  readLastExplicitDeckTemplateId,
  rememberLastExplicitDeckTemplateId,
} from "../src/teamver/canvasSlideLaunch";
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
  it("keeps the previous wordmark, subtitle, and an icon CTA", () => {
    const onCreate = vi.fn();
    wrap(<TeamverHomeCreateHero onCreate={onCreate} />);
    const hero = screen.getByTestId("teamver-home-create-hero");
    expect(hero.querySelector(".home-hero__brand-logo")).toBeTruthy();
    expect(hero.textContent).toMatch(/Turn ideas into slide drafts quickly with AI/i);
    const cta = screen.getByTestId("teamver-home-create-cta");
    expect(cta.querySelector("svg")).toBeTruthy();
    expect(cta.textContent).toMatch(/New slide/i);
    fireEvent.click(cta);
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

describe("TeamverHomeSlideCreateModal overlay", () => {
  it("portals a fixed picker backdrop instead of in-flow home content", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={[{ id: "html-ppt-hermes", title: "Hermes", record: null }]}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const backdrop = screen.getByTestId("teamver-home-slide-create-backdrop");
    expect(backdrop.className).toContain("teamver-drive-picker-backdrop");
    expect(backdrop.parentElement).toBe(document.body);
  });
});

describe("TeamverHomeSlideCreateModal", () => {
  const templates = [
    { id: "html-ppt-hermes", title: "Hermes", record: null },
    { id: "example-simple-deck", title: "Default", record: null },
  ];

  it("new entry with explicit style: confirm available on content (no template name in CTA)", () => {
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
    // Explicit pick skips the forced "Next" gate — chip shows Hermes instead.
    expect(screen.getByTestId("teamver-home-slide-create-selected-template").textContent).toContain(
      "Hermes",
    );
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
    expect(screen.getByTestId("teamver-home-slide-create-selected-template").textContent).toContain(
      "Hermes",
    );
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

  it("new entry without explicit template requires visiting style step before confirm", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-next")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-confirm")).toBeNull();
  });

  it("remembers last explicit deck template id across Home surfaces", () => {
    const key = "od:last-explicit-deck-template-id";
    window.sessionStorage.removeItem(key);
    rememberLastExplicitDeckTemplateId(CANVAS_CREATE_SLIDES_PLUGIN_ID);
    expect(readLastExplicitDeckTemplateId()).toBeNull();
    rememberLastExplicitDeckTemplateId("example-html-ppt-zhangzara-daisy-days");
    expect(readLastExplicitDeckTemplateId()).toBe("example-html-ppt-zhangzara-daisy-days");
    window.sessionStorage.removeItem(key);
  });
});
