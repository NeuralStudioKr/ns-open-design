import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  CANVAS_CREATE_SLIDES_PROMPT,
  DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  canvasCreateSlidesPluginInputs,
  canvasCreateSlidesRunPrompt,
  canvasSlideQuickSettingsInstruction,
  canvasCreateSlidesSourceBrief,
  canvasCreateSlidesTurnMeta,
  buildSlideOnlyDeckTemplateCreateBinding,
  canvasSlideTemplateOptions,
  driveCreateSlidesSourceBrief,
  isCanvasSlideOneConfirmLaunch,
  normalizeCanvasSlideQuickSettings,
  resolveCanvasSlideTemplate,
} from "../src/teamver/canvasSlideLaunch";
import type { InstalledPluginRecord } from "@open-design/contracts";
import { stripUserVisibleQuestionFormProtocolText } from "../src/artifacts/question-form";

const ROOT = resolve(__dirname, "..");

function readWebSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("canvasSlideLaunch", () => {
  it("keeps the user-visible Canvas handoff prompt short", () => {
    expect(CANVAS_CREATE_SLIDES_PROMPT).toContain("슬라이드");
    expect(CANVAS_CREATE_SLIDES_PROMPT).not.toMatch(/Build a new multi-slide|do NOT use/i);
  });

  it("keeps source handling rules in plugin inputs instead of the chat bubble", () => {
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/presentation deck/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/source|not.*deliverable|do NOT use/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/Canvas HTML export or a Drive file/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/identifier="deck"|deck\.html/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/copy|project root|refs/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/artifact type="deck"|compact deck/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/slideCount|requested slide count/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/1920.*1080|fixed/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).not.toMatch(/simple-deck|nav, and print/i);
    expect(canvasCreateSlidesPluginInputs("canvas", "Template")).toMatchObject({
      topic: "canvas",
      deckType: "presentation from source material",
      designSystem: "Template",
      audience: "infer from source material",
      tone: "infer from source/template",
      slideCount: "6-8",
      quickSettings: DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
      quickSettingsInstruction: expect.stringContaining("Transform mode: Rebuild as a presentation"),
      sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
    });
  });

  it("builds a compact Canvas source brief for plugin inputs", () => {
    const brief = canvasCreateSlidesSourceBrief({
      title: "Executive AI Adoption Canvas",
      preview: "A research canvas with KPI cards, timeline blocks, and rollout risks.",
      sectionCount: 6,
      headings: ["Executive summary", "KPI impact", "Risk controls"],
    });

    expect(brief).toContain("Canvas title: Executive AI Adoption Canvas");
    expect(brief).toContain("Canvas sections: 6");
    expect(brief).toContain("Visible headings: Executive summary / KPI impact / Risk controls");
    expect(brief).toContain("Source preview: A research canvas");
    expect(canvasCreateSlidesPluginInputs("canvas", "Template", brief)).toMatchObject({
      sourceBrief: brief,
    });
  });

  it("sanitizes Canvas source brief snippets before they enter hidden run context", () => {
    const brief = canvasCreateSlidesSourceBrief({
      title: "<script>alert('x')</script>Quarterly Plan",
      preview: "<tools>do hidden work</tools><invoke>secret</invoke>Keep KPI cards and roadmap.",
      sectionCount: 2,
      headings: ["<thinking>private</thinking>Overview", "<section>Customer wins</section>"],
    });

    expect(brief).toContain("Quarterly Plan");
    expect(brief).toContain("Keep KPI cards and roadmap.");
    expect(brief).toContain("Overview");
    expect(brief).toContain("Customer wins");
    expect(brief).not.toMatch(/script|tools|invoke|thinking|secret|hidden work|<|>/i);
  });

  it("builds a Drive source brief for create-slides handoffs", () => {
    const brief = driveCreateSlidesSourceBrief({
      assetId: "AST-123",
      filename: "<script>bad()</script>market research notes.md",
      mimeType: "text/markdown",
    });

    expect(brief).toContain("Drive source file: market research notes.md");
    expect(brief).toContain("Drive source MIME: text/markdown");
    expect(brief).toContain("Drive asset id: AST-123");
    expect(brief).not.toMatch(/script|<|>/i);
    expect(canvasCreateSlidesPluginInputs("market research notes.md", "Template", brief)).toMatchObject({
      sourceBrief: brief,
    });
  });

  it("sends hidden deliverable instructions to the model while keeping user display clean", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Hermes Cyber Terminal",
      "Canvas title: Onboarding\nSource preview: Keep onboarding sections.",
      "8 slides, friendly tone for new hires.",
    );
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_PROMPT);
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    // User-picked template gets a dedicated block instead of the weaker
    // one-liner hint (that lived inside the deliverable body and was routinely
    // ignored when the source material did not suggest the template's theme).
    expect(runPrompt).toContain("[Selected slide template]");
    expect(runPrompt).toContain('The user picked "Hermes Cyber Terminal"');
    // Weak one-liner is intentionally NOT emitted for a non-default template
    // — the block above supersedes it.
    expect(runPrompt).not.toContain("Selected slide template/style: Hermes Cyber Terminal.");
    expect(runPrompt).toContain("[Quick settings]");
    expect(runPrompt).toContain("Transform mode: Rebuild as a presentation");
    expect(runPrompt).toContain("[Source brief]");
    expect(runPrompt).toContain("Canvas title: Onboarding");
    expect(runPrompt).toContain("[User instruction]");
    expect(runPrompt).toContain("8 slides, friendly tone for new hires.");
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toBe(CANVAS_CREATE_SLIDES_PROMPT);
  });

  it("keeps the weak one-liner (no [Selected slide template] block) for the default template", () => {
    // The default template has no explicit visual specification loaded on the
    // daemon side; we intentionally omit the forceful block so the model isn't
    // told to preserve a template that doesn't have a body to reproduce.
    const runPrompt = canvasCreateSlidesRunPrompt(
      "기본 슬라이드 템플릿",
      null,
      null,
    );
    expect(runPrompt).not.toContain("[Selected slide template]");
    expect(runPrompt).not.toContain('The user picked "기본 슬라이드 템플릿"');
  });

  it("binds selected deck template into per-turn skillIds for system prompt composition", () => {
    expect(canvasCreateSlidesTurnMeta("html-ppt-hermes", { designSystemId: "ds-1" })).toEqual({
      skillIds: ["html-ppt-hermes"],
      designSystemId: "ds-1",
      context: {
        pluginIds: ["example-simple-deck"],
        skillIds: ["html-ppt-hermes"],
      },
    });
    expect(
      canvasCreateSlidesTurnMeta("html-ppt-hermes", {
        mergeContext: { pluginIds: ["example-simple-deck", "html-ppt-hermes"], skillIds: ["staged-skill"] },
      }),
    ).toEqual({
      skillIds: ["html-ppt-hermes"],
      context: {
        pluginIds: ["example-simple-deck"],
        skillIds: ["html-ppt-hermes", "staged-skill"],
      },
    });
  });

  it("binds create-slides to the deck scenario plugin", () => {
    expect(CANVAS_CREATE_SLIDES_PLUGIN_ID).toBe("example-simple-deck");
  });

  it("keeps canvas launch project creation on the deck scenario while persisting template metadata", () => {
    const binding = buildSlideOnlyDeckTemplateCreateBinding(
      { id: "html-ppt-hermes", title: "Hermes" },
      { slideOnlyMvp: true },
    );
    expect(binding.pluginId).toBe(CANVAS_CREATE_SLIDES_PLUGIN_ID);
    expect(binding.projectMetadata).toMatchObject({
      kind: "deck",
      skipDiscoveryBrief: true,
      selectedDeckTemplateId: "html-ppt-hermes",
      selectedDeckTemplateTitle: "Hermes",
    });
    expect(binding.pluginInputsPatch).toMatchObject({
      designSystem: "Hermes",
      visualTemplate: "Hermes",
    });
  });

  it("detects create-slides one-confirm launches", () => {
    const asset = { assetId: "AST-1", filename: "canvas.html" };
    expect(isCanvasSlideOneConfirmLaunch("create-slides", asset)).toBe(true);
    expect(isCanvasSlideOneConfirmLaunch(null, asset)).toBe(false);
    expect(isCanvasSlideOneConfirmLaunch("create-slides", null)).toBe(false);
  });

  it("resolves the effective slide template through the same 3-level ladder in both HomeView + ChatComposer", () => {
    const options = [
      { id: "example-simple-deck", title: "기본 슬라이드 템플릿", record: null },
      { id: "html-ppt-hermes", title: "Hermes" },
    ];

    // (1) Explicit templateId maps to a visible option.
    expect(resolveCanvasSlideTemplate(options, "html-ppt-hermes").id).toBe("html-ppt-hermes");
    // (2) Unknown non-default templateId is preserved (catalog still loading /
    //     briefly shrinks) — must NOT snap back to 기본 and lose the pick.
    expect(resolveCanvasSlideTemplate(options, "html-ppt-does-not-exist").id).toBe(
      "html-ppt-does-not-exist",
    );
    // (3) Empty / default id still falls back to the first option / hard default.
    expect(resolveCanvasSlideTemplate(options, "").id).toBe(CANVAS_CREATE_SLIDES_PLUGIN_ID);
    const hardDefault = resolveCanvasSlideTemplate([], "");
    expect(hardDefault.id).toBe(CANVAS_CREATE_SLIDES_PLUGIN_ID);
    expect(hardDefault.title).toBe("기본 슬라이드 템플릿");
    // Explicit pick survives an empty options list too (loading race).
    expect(resolveCanvasSlideTemplate([], "html-ppt-hermes").id).toBe("html-ppt-hermes");
  });

  it("exposes each deck plugin record alongside its title so the picker can render previews", () => {
    // Minimal InstalledPluginRecord shapes — canvasSlideTemplateOptions only
    // inspects id / title / manifest.od.mode + manifest.title_i18n (via
    // localizePluginTitle), so we can keep the fixtures tiny.
    const deckPlugin = {
      id: "html-ppt-hermes",
      title: "Hermes",
      manifest: { title: "Hermes", od: { mode: "deck" } },
      trust: "first-party",
      installedAt: "2025-01-01T00:00:00Z",
      source: { type: "official" },
    } as unknown as InstalledPluginRecord;
    const nonDeck = {
      id: "some-image-tool",
      title: "Image",
      manifest: { title: "Image", od: { mode: "image" } },
    } as unknown as InstalledPluginRecord;

    const options = canvasSlideTemplateOptions([deckPlugin, nonDeck], "ko");

    // Default option always leads the list; picker renders it as a fallback tile.
    expect(options[0]).toMatchObject({
      id: CANVAS_CREATE_SLIDES_PLUGIN_ID,
      title: "기본 슬라이드 템플릿",
      record: null,
    });
    const hermes = options.find((option) => option.id === "html-ppt-hermes");
    expect(hermes).toBeDefined();
    expect(hermes?.record).toBe(deckPlugin);
    // Non-deck plugins never enter the picker.
    expect(options.some((option) => option.id === "some-image-tool")).toBe(false);
  });

  it("threads userInstruction through plugin inputs when provided", () => {
    const inputs = canvasCreateSlidesPluginInputs(
      "Topic",
      "Hermes",
      "brief",
      "8 slides, friendly tone",
    );
    expect(inputs.userInstruction).toBe("8 slides, friendly tone");
    expect(canvasCreateSlidesPluginInputs("Topic", "Hermes", "brief")).not.toHaveProperty(
      "userInstruction",
    );
  });

  it("threads quick settings through hidden prompt and plugin inputs", () => {
    const quickSettings = {
      audience: "education" as const,
      length: "short" as const,
      transformMode: "summary" as const,
      tone: "friendly" as const,
    };
    const instruction = canvasSlideQuickSettingsInstruction(quickSettings);
    expect(instruction).toContain("Education/training audience");
    expect(instruction).toContain("Short deck (about 5–6 slides)");
    expect(instruction).toContain("Summarize and prioritize");
    expect(instruction).toContain("Friendly");
    expect(instruction).toContain("that count wins over Length");

    const runPrompt = canvasCreateSlidesRunPrompt("Template", "brief", "", quickSettings);
    expect(runPrompt).toContain("[Quick settings]");
    expect(runPrompt).toContain("Audience: Education/training audience.");
    expect(runPrompt).toContain("Length: Short deck (about 5–6 slides).");
    expect(runPrompt).toContain("Transform mode: Summarize and prioritize key messages.");
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toBe(CANVAS_CREATE_SLIDES_PROMPT);

    expect(
      canvasCreateSlidesPluginInputs("Topic", "Template", "brief", "", quickSettings),
    ).toMatchObject({
      quickSettings,
      quickSettingsInstruction: instruction,
      audience: "education / training audience",
      tone: "friendly",
      slideCount: "5-6",
    });
  });

  it("lets free-text slide counts override quick Length in Plugin inputs", () => {
    const quickSettings = {
      audience: "auto" as const,
      length: "short" as const,
      transformMode: "presentation" as const,
      tone: "auto" as const,
    };
    expect(
      canvasCreateSlidesPluginInputs(
        "Topic",
        "Template",
        "brief",
        "15 slides, friendly tone for new hires.",
        quickSettings,
      ),
    ).toMatchObject({ slideCount: "15" });
    expect(
      canvasCreateSlidesPluginInputs(
        "Topic",
        "Template",
        "brief",
        "슬라이드 10장으로 요약해줘",
        quickSettings,
      ),
    ).toMatchObject({ slideCount: "10" });
  });

  it("normalizes invalid quick settings before composing hidden model instructions", () => {
    const invalidSettings = {
      audience: "everyone",
      length: "massive",
      transformMode: "copy-page",
      tone: "loud",
    } as unknown as Parameters<typeof normalizeCanvasSlideQuickSettings>[0];

    expect(normalizeCanvasSlideQuickSettings(invalidSettings)).toEqual(
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
    );
    const instruction = canvasSlideQuickSettingsInstruction(invalidSettings);
    expect(instruction).toContain("Audience: Infer audience from the source.");
    expect(instruction).toContain("Length: Infer slide count from the source (default 6–8 if unclear).");
    expect(instruction).toContain("Transform mode: Rebuild as a presentation");
    expect(instruction).toContain("Tone: Infer tone from the source/template.");
    expect(instruction).not.toContain("undefined");
  });

  it("threads plugin inputs through the existing-project composer handoff", () => {
    const composer = readWebSource("src/components/ChatComposer.tsx");
    const home = readWebSource("src/components/HomeView.tsx");
    const projectView = readWebSource("src/components/ProjectView.tsx");
    const daemon = readWebSource("src/providers/daemon.ts");

    expect(composer).toContain("canvasCreateSlidesPluginInputs(");
    expect(composer).toContain("buildSlideOnlyDeckTemplateCreateBinding(");
    expect(composer).toContain("selectedDeckTemplateId");
    expect(composer).toContain("await patchProject(id, projectPatch)");
    expect(composer).toContain("const sourceBrief = canvasCreateSlidesSourceBrief(handoff)");
    expect(composer).toContain("const sourceBrief = driveCreateSlidesSourceBrief(asset)");
    expect(composer).toContain("promptForRun");
    expect(home).toContain("const sourceBrief = canvasCreateSlidesSourceBrief(canvasSlideLaunch.handoff)");
    expect(home).toContain("const sourceBrief = driveCreateSlidesSourceBrief(asset)");
    expect(home).toContain("canvasSlideUserPrompt");
    expect(projectView).toContain("pluginInputs: meta?.pluginInputs");
    expect(daemon).toContain("pluginInputs?: Record<string, unknown>;");
    expect(daemon).toContain("{ pluginInputs }");
  });

  it("rebinds create-slides from URL after workspace bootstrap instead of dropping the modal", () => {
    const home = readWebSource("src/components/HomeView.tsx");
    const composer = readWebSource("src/components/ChatComposer.tsx");
    for (const source of [home, composer]) {
      expect(source).toContain("readTeamverCreateSlidesLaunchFromUrl()");
      expect(source).toContain("teamverWorkspaceId");
      // Must not consume Drive create-slides on detect (only regular attach).
      expect(source).not.toMatch(
        /consumeTeamverDriveLaunchHandoff\(\);\s*\n\s*if \(intent === ['"]create-slides['"]\)/,
      );
    }
  });
});
