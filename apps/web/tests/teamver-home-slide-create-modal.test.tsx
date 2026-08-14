// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TeamverHomeSlideCreateModal } from "../src/teamver/components/TeamverHomeSlideCreateModal";
import { TeamverHomeCreateHero } from "../src/teamver/components/TeamverHomeCreateHero";
import {
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS,
  clearLastExplicitDeckTemplateId,
  createHomeSlideCreateQuickSettings,
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

  it("does not dismiss on Escape while a nested picker overlay is on top", () => {
    const onClose = vi.fn();
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
        onClose={onClose}
      />,
    );
    const nested = document.createElement("div");
    nested.className = "teamver-drive-picker-backdrop";
    document.body.appendChild(nested);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    nested.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
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
    const contentStep = screen.getByTestId("teamver-home-slide-create-step-content").closest("li");
    expect(contentStep?.getAttribute("aria-current")).toBe("step");
    expect(
      screen.getByTestId("teamver-home-slide-create-step-template").closest("li")?.getAttribute("aria-current"),
    ).toBeNull();
    // 안 B: pick is shown on the stepper, not a footer "Change" chip.
    expect(screen.queryByTestId("teamver-home-slide-create-selected-template")).toBeNull();
    expect(screen.getByTestId("teamver-home-slide-create-step-pick").textContent).toContain("Hermes");
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
    expect(screen.queryByTestId("teamver-home-slide-create-selected-template")).toBeNull();
    expect(screen.getByTestId("teamver-home-slide-create-step-pick").textContent).toContain("Hermes");
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-step-template"));
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
    expect(screen.getByTestId("teamver-home-slide-create-summary").textContent).toMatch(
      /Internal report · Standard · Professional/,
    );
    expect(screen.getByTestId("teamver-home-slide-create-prev")).toBeTruthy();
  });

  it("gallery entry: picking another template on step 2 returns to content", () => {
    const onTemplateChange = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="template"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={onTemplateChange}
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-step-template"));
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-template-card-example-simple-deck"));
    expect(onTemplateChange).toHaveBeenCalledWith("example-simple-deck");
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-template")).toBeNull();
    expect(screen.getByTestId("teamver-home-slide-create-confirm")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-next")).toBeNull();
  });

  it("gallery entry with the default template still confirms from content", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="template"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    expect(screen.getByTestId("teamver-home-slide-create-confirm")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-next")).toBeNull();
    expect(screen.getByTestId("teamver-home-slide-create-step-pick").textContent).toMatch(
      /Default slide template/i,
    );
  });

  it("new entry: picking a template on step 2 stays on the grid", () => {
    const onTemplateChange = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={onTemplateChange}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-next"));
    fireEvent.click(screen.getByTestId("teamver-canvas-slide-launch-template-card-html-ppt-hermes"));
    expect(onTemplateChange).toHaveBeenCalledWith("html-ppt-hermes");
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
    expect(screen.queryByTestId("teamver-home-slide-create-content")).toBeNull();
  });

  it("uses a compact dialog on content and widens on the template step", () => {
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
    expect(screen.getByTestId("teamver-home-slide-create-modal").className).toContain(
      "teamver-home-slide-create-modal--compact",
    );
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-next"));
    expect(screen.getByTestId("teamver-home-slide-create-modal").className).toContain(
      "teamver-canvas-slide-launch-modal--wide",
    );
    expect(screen.getByTestId("teamver-home-slide-create-summary").textContent).toContain(
      "Internal report",
    );
  });

  it("submits with Cmd+Enter once the template step is available", () => {
    const onConfirm = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="template"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("teamver-home-slide-create-modal"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("removes a drive attachment by asset id", () => {
    const onRemoveDriveAsset = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        stagedDriveAssets={[{ assetId: "drv-1", filename: "brief.pdf" }]}
        onRemoveDriveAsset={onRemoveDriveAsset}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove attachment"));
    expect(onRemoveDriveAsset).toHaveBeenCalledWith("drv-1");
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
      /e\.g\. Q3 results/i,
    );
    expect(screen.queryByTestId("teamver-home-slide-create-tip-btn")).toBeNull();
    expect(screen.queryByTestId("teamver-home-slide-create-tips")).toBeNull();
  });

  it("stages dropped files from the attach zone", () => {
    const onAddFiles = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onAddFiles={onAddFiles}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const file = new File(["brief"], "brief.txt", { type: "text/plain" });
    fireEvent.drop(screen.getByTestId("teamver-home-slide-create-attach-zone"), {
      dataTransfer: { files: [file], items: [], types: ["Files"] },
    });
    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it("stages pasted files on the dialog", () => {
    const onAddFiles = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onAddFiles={onAddFiles}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const file = new File(["shot"], "shot.png", { type: "image/png" });
    fireEvent.paste(screen.getByTestId("teamver-home-slide-create-modal"), {
      clipboardData: { files: [file], items: [], types: ["Files"] },
    });
    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it("new entry without explicit template requires visiting template step before confirm", () => {
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
    expect(screen.getByTestId("teamver-home-slide-create-step-template").textContent).toContain(
      "Template",
    );
    expect(screen.queryByTestId("teamver-home-slide-create-selected-template")).toBeNull();
    expect(screen.queryByTestId("teamver-home-slide-create-step-pick")).toBeNull();
    const next = screen.getByTestId("teamver-home-slide-create-next");
    expect(next.textContent).toBe("Next: Template");
    expect(next.textContent).not.toMatch(/style/i);
    expect(screen.queryByTestId("teamver-home-slide-create-confirm")).toBeNull();
  });

  it("resets quick settings to defaults when the modal opens", () => {
    const onQuickSettingsChange = vi.fn();
    const stale = {
      ...DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS,
      audience: "client" as const,
      length: "detailed" as const,
      tone: "impact" as const,
    };
    const view = wrap(
      <TeamverHomeSlideCreateModal
        open={false}
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        quickSettings={stale}
        onQuickSettingsChange={onQuickSettingsChange}
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(onQuickSettingsChange).not.toHaveBeenCalled();
    view.rerender(
      <I18nProvider locale="en">
        <TeamverHomeSlideCreateModal
          open
          entry="new"
          templateOptions={templates}
          selectedTemplateId="example-simple-deck"
          quickSettings={stale}
          onQuickSettingsChange={onQuickSettingsChange}
          userPrompt=""
          onUserPromptChange={() => {}}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    expect(onQuickSettingsChange).toHaveBeenCalledWith(createHomeSlideCreateQuickSettings());
    expect(onQuickSettingsChange.mock.calls[0][0]).not.toBe(DEFAULT_HOME_SLIDE_CREATE_QUICK_SETTINGS);
  });

  it("pins explicit canvas picks and clears them on demand", () => {
    const key = "od:last-explicit-deck-template-id";
    window.sessionStorage.removeItem(key);
    rememberLastExplicitDeckTemplateId(CANVAS_CREATE_SLIDES_PLUGIN_ID);
    expect(readLastExplicitDeckTemplateId()).toBeNull();
    rememberLastExplicitDeckTemplateId("example-html-ppt-zhangzara-daisy-days");
    expect(readLastExplicitDeckTemplateId()).toBe("example-html-ppt-zhangzara-daisy-days");
    clearLastExplicitDeckTemplateId();
    expect(readLastExplicitDeckTemplateId()).toBeNull();
    window.sessionStorage.removeItem(key);
  });
});
