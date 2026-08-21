// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TeamverHomeSlideCreateModal } from "../src/teamver/components/TeamverHomeSlideCreateModal";
import { HomeSlideCreateAttachChips } from "../src/teamver/components/HomeSlideCreateAttachChips";
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
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    const dialog = screen.getByTestId("teamver-home-slide-create-modal");
    expect(dialog.getAttribute("aria-describedby")).toBe("teamver-home-slide-create-lead");
    expect(screen.getByTestId("teamver-home-slide-create-lead").textContent).toMatch(
      /brief and a template/i,
    );
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
      /Internal report · Standard · 8–10 · Professional/,
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
    const confirm = screen.getByTestId("teamver-home-slide-create-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId("teamver-home-slide-create-empty-hint").textContent).toMatch(
      /write what to create|attach a reference file/i,
    );
    expect(confirm.getAttribute("aria-describedby")).toBe("teamver-home-slide-create-empty-hint");
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
        userPrompt="Q3 update"
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
        userPrompt="Q3 update"
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
      "Standard · 8–10",
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
        userPrompt="Q3 update"
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

  it("shows a type icon for non-image attachments and keeps the extension visible", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        stagedFiles={[
          new File(["brief"], "brief.pdf", { type: "application/pdf" }),
          new File(["deck"], "pitch.pptx", {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
        ]}
        stagedDriveAssets={[{ assetId: "drv-csv", filename: "metrics.csv", mimeType: "text/csv" }]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const chips = screen.getByTestId("teamver-home-slide-create-chips");
    expect(chips.querySelectorAll("[data-testid='teamver-home-slide-create-chip-icon']")).toHaveLength(3);
    expect(
      chips.querySelector('[data-filename="pitch.pptx"] [data-icon="present"]'),
    ).toBeTruthy();
    expect(
      chips.querySelector('[data-asset-id="drv-csv"] [data-icon="file-code"]'),
    ).toBeTruthy();
    expect(chips.textContent).toContain(".pdf");
    expect(chips.textContent).toContain(".pptx");
    expect(chips.textContent).toContain(".csv");
    expect(screen.getByLabelText("Remove attachment: brief.pdf")).toBeTruthy();
    expect(screen.getByLabelText("Remove attachment: pitch.pptx")).toBeTruthy();
    expect(screen.getByLabelText("Remove attachment: metrics.csv")).toBeTruthy();
  });

  it("renders a local image thumbnail for staged image attachments", () => {
    const objectUrl = "blob:teamver-home-attach-preview";
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      wrap(
        <TeamverHomeSlideCreateModal
          open
          entry="new"
          templateOptions={templates}
          selectedTemplateId="html-ppt-hermes"
          onTemplateChange={() => {}}
          userPrompt=""
          onUserPromptChange={() => {}}
          stagedFiles={[new File(["img"], "cover.png", { type: "image/png" })]}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
      const thumb = screen
        .getByTestId("teamver-home-slide-create-chips")
        .querySelector("img.teamver-home-slide-create-chip-thumb") as HTMLImageElement | null;
      expect(thumb?.getAttribute("src")).toBe(objectUrl);
      expect(createObjectURL).toHaveBeenCalled();
      expect(screen.getByLabelText("Remove attachment: cover.png")).toBeTruthy();
    } finally {
      cleanup();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it("falls back to a type icon when an image thumbnail fails to load", () => {
    const objectUrl = "blob:teamver-home-attach-broken";
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      wrap(
        <TeamverHomeSlideCreateModal
          open
          entry="new"
          templateOptions={templates}
          selectedTemplateId="html-ppt-hermes"
          onTemplateChange={() => {}}
          userPrompt=""
          onUserPromptChange={() => {}}
          stagedFiles={[new File(["img"], "broken.png", { type: "image/png" })]}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
      const thumb = screen
        .getByTestId("teamver-home-slide-create-chips")
        .querySelector("img.teamver-home-slide-create-chip-thumb") as HTMLImageElement | null;
      expect(thumb).toBeTruthy();
      fireEvent.error(thumb!);
      expect(
        screen
          .getByTestId("teamver-home-slide-create-chips")
          .querySelector('[data-testid="teamver-home-slide-create-chip-icon"][data-icon="image"]'),
      ).toBeTruthy();
    } finally {
      cleanup();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it("keeps object URLs for remaining image chips when a middle file is removed", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => `blob:preview-${(blob as File).name}`);
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      const files = [
        new File(["a"], "a.png", { type: "image/png" }),
        new File(["b"], "b.png", { type: "image/png" }),
        new File(["c"], "c.png", { type: "image/png" }),
      ];
      const onRemoveFile = vi.fn();
      const { rerender } = wrap(
        <TeamverHomeSlideCreateModal
          open
          entry="new"
          templateOptions={templates}
          selectedTemplateId="html-ppt-hermes"
          onTemplateChange={() => {}}
          userPrompt=""
          onUserPromptChange={() => {}}
          stagedFiles={files}
          onRemoveFile={onRemoveFile}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
      expect(createObjectURL).toHaveBeenCalledTimes(3);
      const before = Array.from(
        screen
          .getByTestId("teamver-home-slide-create-chips")
          .querySelectorAll("img.teamver-home-slide-create-chip-thumb"),
      ).map((node) => (node as HTMLImageElement).getAttribute("src"));
      expect(before).toEqual(["blob:preview-a.png", "blob:preview-b.png", "blob:preview-c.png"]);

      createObjectURL.mockClear();
      rerender(
        <I18nProvider locale="en">
          <TeamverHomeSlideCreateModal
            open
            entry="new"
            templateOptions={templates}
            selectedTemplateId="html-ppt-hermes"
            onTemplateChange={() => {}}
            userPrompt=""
            onUserPromptChange={() => {}}
            stagedFiles={[files[0]!, files[2]!]}
            onRemoveFile={onRemoveFile}
            onConfirm={() => {}}
            onClose={() => {}}
          />
        </I18nProvider>,
      );

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-b.png");
      const after = Array.from(
        screen
          .getByTestId("teamver-home-slide-create-chips")
          .querySelectorAll("img.teamver-home-slide-create-chip-thumb"),
      ).map((node) => (node as HTMLImageElement).getAttribute("src"));
      expect(after).toEqual(["blob:preview-a.png", "blob:preview-c.png"]);
    } finally {
      cleanup();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it("refetches a Drive image thumb with sharedDriveId when the cache misses", async () => {
    const thumbApi = await import("../src/teamver/driveImportThumbnails");
    const peekSpy = vi.spyOn(thumbApi, "peekTeamverDriveImportThumbnail").mockReturnValue(undefined);
    const fetchSpy = vi
      .spyOn(thumbApi, "fetchTeamverDriveImportThumbnails")
      .mockResolvedValue(new Map([["drv-img", "https://thumb.example/shared.png"]]));
    try {
      wrap(
        <HomeSlideCreateAttachChips
          stagedFiles={[]}
          stagedDriveAssets={[
            {
              assetId: "drv-img",
              filename: "shared.png",
              mimeType: "image/png",
              sharedDriveId: "SD-TEAM",
            },
          ]}
          workspaceId="ws-1"
          removeAttachLabel="Remove attachment"
        />,
      );
      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith({
          workspaceId: "ws-1",
          items: [
            {
              assetId: "drv-img",
              name: "shared.png",
              mimeType: "image/png",
              sharedDriveId: "SD-TEAM",
            },
          ],
        });
      });
      await vi.waitFor(() => {
        expect(
          screen
            .getByTestId("teamver-home-slide-create-chips")
            .querySelector("img.teamver-home-slide-create-chip-thumb")
            ?.getAttribute("src"),
        ).toBe("https://thumb.example/shared.png");
      });
    } finally {
      peekSpy.mockRestore();
      fetchSpy.mockRestore();
      cleanup();
    }
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
    fireEvent.click(screen.getByLabelText("Remove attachment: brief.pdf"));
    expect(onRemoveDriveAsset).toHaveBeenCalledWith("drv-1");
  });

  it("keeps Drive visible but disabled when workspace import is unavailable", () => {
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
    const drive = screen.getByTestId("teamver-home-slide-create-drive");
    expect((drive as HTMLButtonElement).disabled).toBe(true);
    expect(drive.getAttribute("title")).toMatch(/workspace/i);
    expect(drive.getAttribute("aria-label")).toMatch(/workspace/i);
  });

  it("enables Drive when an attach callback is provided", () => {
    const onAttachFromDrive = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        onAttachFromDrive={onAttachFromDrive}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const drive = screen.getByTestId("teamver-home-slide-create-drive");
    expect((drive as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(drive);
    expect(onAttachFromDrive).toHaveBeenCalledOnce();
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

  it("limits the file picker to slide-friendly types", () => {
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
    const input = document.querySelector("input[type='file']") as HTMLInputElement | null;
    expect(input?.getAttribute("accept")).toMatch(/image\/\*|\.pdf|\.pptx/);
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
    const next = screen.getByTestId("teamver-home-slide-create-next") as HTMLButtonElement;
    expect(next.textContent).toBe("Next: Template");
    expect(next.textContent).not.toMatch(/style/i);
    expect(next.disabled).toBe(true);
    expect(screen.getByTestId("teamver-home-slide-create-empty-hint").textContent).toMatch(
      /write what to create|attach a reference file/i,
    );
    expect(next.getAttribute("aria-describedby")).toBe("teamver-home-slide-create-empty-hint");
    expect(
      (screen.getByTestId("teamver-home-slide-create-step-template") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByTestId("teamver-home-slide-create-confirm")).toBeNull();
  });

  it("blocks next, template step, and confirm when prompt and attachments are empty", () => {
    const onConfirm = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="html-ppt-hermes"
        onTemplateChange={() => {}}
        userPrompt="   "
        onUserPromptChange={() => {}}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const confirm = screen.getByTestId("teamver-home-slide-create-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId("teamver-home-slide-create-empty-hint")).toBeTruthy();
    fireEvent.click(confirm);
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-step-template"));
    fireEvent.keyDown(screen.getByTestId("teamver-home-slide-create-modal"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId("teamver-home-slide-create-template")).toBeNull();
  });

  it("lets an attachment-only draft go to the template step", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={() => {}}
        userPrompt=""
        onUserPromptChange={() => {}}
        stagedFiles={[new File(["brief"], "brief.pdf", { type: "application/pdf" })]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const next = screen.getByTestId("teamver-home-slide-create-next") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(screen.queryByTestId("teamver-home-slide-create-empty-hint")).toBeNull();
    fireEvent.click(next);
    expect(screen.getByTestId("teamver-home-slide-create-template")).toBeTruthy();
  });

  it("new entry shows the default pick and confirm after visiting the template step", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        onTemplateChange={() => {}}
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-next"));
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-prev"));
    expect(screen.getByTestId("teamver-home-slide-create-content")).toBeTruthy();
    expect(screen.getByTestId("teamver-home-slide-create-confirm")).toBeTruthy();
    expect(screen.getByTestId("teamver-home-slide-create-step-pick").textContent).toMatch(
      /Default slide template/i,
    );
    expect(screen.getByTestId("teamver-home-slide-create-step-template").textContent).toContain("✓");
    expect(screen.getByTestId("teamver-home-slide-create-step-template").getAttribute("aria-label")).toMatch(
      /Template .*Default slide template/i,
    );
  });

  it("shows slide-count ranges and accepts a custom count", () => {
    const onQuickSettingsChange = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        quickSettings={createHomeSlideCreateQuickSettings()}
        onQuickSettingsChange={onQuickSettingsChange}
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("teamver-home-slide-create-quick-length-short").textContent).toMatch(
      /5–6/,
    );
    expect(screen.getByTestId("teamver-home-slide-create-quick-length-standard").textContent).toMatch(
      /8–10/,
    );
    expect(screen.getByTestId("teamver-home-slide-create-quick-length-detailed").textContent).toMatch(
      /12–15/,
    );
    fireEvent.change(screen.getByTestId("teamver-home-slide-create-slide-count"), {
      target: { value: "12" },
    });
    expect(onQuickSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ customSlideCount: 12 }),
    );
  });

  it("clears a custom slide count when a length chip is picked", () => {
    const onQuickSettingsChange = vi.fn();
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        templateOptions={templates}
        selectedTemplateId="example-simple-deck"
        quickSettings={{
          ...createHomeSlideCreateQuickSettings(),
          customSlideCount: 12,
        }}
        onQuickSettingsChange={onQuickSettingsChange}
        userPrompt="Q3 update"
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      (screen.getByTestId("teamver-home-slide-create-slide-count") as HTMLInputElement).value,
    ).toBe("12");
    fireEvent.click(screen.getByTestId("teamver-home-slide-create-quick-length-short"));
    expect(onQuickSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ length: "short", customSlideCount: null }),
    );
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

  it("surfaces confirm errors in an alert region", () => {
    wrap(
      <TeamverHomeSlideCreateModal
        open
        entry="new"
        errorMessage="Template unavailable"
        templateOptions={[{ id: "html-ppt-hermes", title: "Hermes", record: null }]}
        selectedTemplateId="html-ppt-hermes"
        userPrompt=""
        onUserPromptChange={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const alert = screen.getByTestId("teamver-home-slide-create-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe("Template unavailable");
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
