import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  CANVAS_CREATE_SLIDES_PROMPT,
  DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
  createHomeSlideCreateQuickSettings,
  hasHomeSlideCreateContent,
  parseCustomSlideCountInput,
  resolveCanvasSlideQuickSlideCount,
  HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  HOME_EMPTY_CREATE_SLIDES_PROMPT,
  SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE,
  SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION,
  SLIDE_DECK_QUALITY_BAR_INSTRUCTION,
  canvasCreateSlidesPluginInputs,
  canvasCreateSlidesRunPrompt,
  sanitizeSlideCreateTopicHint,
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
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/body-first/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/do not emit `<head>`/i);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/body-first/i);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/do not emit `<head>`/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toContain(SLIDE_DECK_QUALITY_BAR_INSTRUCTION);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toContain(SLIDE_DECK_QUALITY_BAR_INSTRUCTION);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toContain(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toContain(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toContain(SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/brief is a topic, not slide text/i);
    expect(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/Expo for Senior Engineers/);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/Expo for Senior Engineers/);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).not.toMatch(/simple-deck|nav, and print/i);
    expect(sanitizeSlideCreateTopicHint("Html Ppt Hermes")).toBeNull();
    expect(sanitizeSlideCreateTopicHint("Daisy Days.png")).toBeNull();
    expect(sanitizeSlideCreateTopicHint("기본 슬라이드 템플릿")).toBeNull();
    expect(sanitizeSlideCreateTopicHint("Q3 results review")).toBe("Q3 results review");
    expect(canvasCreateSlidesPluginInputs("Html Ppt Hermes.png", "Template")).toMatchObject({
      topic: "the user brief",
    });
    expect(canvasCreateSlidesPluginInputs("canvas", "Template")).toMatchObject({
      topic: "canvas",
      deckType: "presentation",
      designSystem: "Template",
      audience: "infer from source material",
      tone: "infer from source/template",
      slideCount: "6-8",
      quickSettings: DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
      quickSettingsInstruction: expect.stringContaining("Transform mode: Rebuild as a presentation"),
      sourceHandlingInstruction: HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION,
    });
    expect(
      canvasCreateSlidesPluginInputs(
        "canvas",
        "Template",
        "Canvas title: Onboarding\nVisible headings: A / B",
      ),
    ).toMatchObject({
      deckType: "presentation from source material",
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

  it("keeps Source brief field lines (Visible headings) instead of collapsing to one line", () => {
    // Regression for incomplete-html-document-shell → outline fallback miss:
    // compacting the whole brief with \\s+ buried "Visible headings:" mid-line.
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Html Ppt Zhangzara Daisy Days",
      [
        "Canvas title: 여행자를 위한 이탈리아 기본 지식",
        "Canvas sections: 6",
        "Visible headings: 지리 · 기본정보 / 주요관광지 / 음식문화 / 여행팁",
        "Source preview: Keep the travel sections.",
      ].join("\n"),
      null,
    );
    const brief = runPrompt.slice(runPrompt.indexOf("[Source brief]"));
    expect(brief).toMatch(/Visible headings:\s*지리/);
    expect(brief).toMatch(/\nVisible headings:/);
    expect(brief).not.toMatch(/Canvas title:[^\n]*Visible headings:/);
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
    expect(runPrompt).toContain("[Selected slide template priority]");
    expect(runPrompt).toContain("Selected template visual contract — READ LAST");
    expect(runPrompt).toContain("token-safe content-swap");
    expect(runPrompt).toContain("deck quality bar");
    expect(runPrompt).toContain("real message density");
    expect(runPrompt).toContain("#c96442");
    expect(runPrompt.lastIndexOf("[Selected slide template priority]")).toBeGreaterThan(
      runPrompt.indexOf("[User instruction]"),
    );
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toBe(CANVAS_CREATE_SLIDES_PROMPT);
  });

  it("explicitly rules out carrying over the attached source Canvas's own visual styling", () => {
    // Canvas → Slide runs attach the source HTML as a reference file. When
    // the source page has its own strong styling (e.g. a warm yellow-green
    // Italy travel gradient with emoji-chip buttons), the model was copying
    // that source aesthetic instead of the picked template — Daisy Days
    // came back looking nothing like Daisy Days.
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Html Ppt Zhangzara Daisy Days",
      "Canvas title: 여행자를 위한 이탈리아 기본 지식",
      null,
    );
    // Deliverable instruction must call out that the source's visual styling
    // does NOT cross over — only content/structure does.
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/Do NOT preserve the source's visual styling/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/Token-safe template apply/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/do NOT paste or regenerate a full example\.html dump/i);
    // [Selected slide template] block must reinforce this on the user side.
    const templateBlock = runPrompt.slice(runPrompt.indexOf("[Selected slide template]"));
    expect(templateBlock).toMatch(/Template kit WIN/i);
    expect(templateBlock).toMatch(/never substitute emoji flowers\/stars/i);
    expect(templateBlock).toMatch(/source['\u2019]s own visual styling/i);
    expect(templateBlock).toMatch(/Do NOT carry over the source['\u2019]s colors/i);
    const priorityBlock = runPrompt.slice(runPrompt.indexOf("[Selected slide template priority]"));
    expect(priorityBlock).toMatch(/READ LAST/i);
    expect(priorityBlock).toMatch(/token-safe content-swap/i);
    expect(priorityBlock).toMatch(/scaffold map/i);
    expect(priorityBlock).toMatch(/real message density/i);
    expect(priorityBlock).toMatch(/#c96442/);
    expect(priorityBlock).toMatch(/never fall back to Neutral Modern, Simple Deck/i);
    expect(runPrompt.lastIndexOf("[Selected slide template priority]")).toBeGreaterThan(
      runPrompt.indexOf("[Source brief]"),
    );
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
    expect(runPrompt).not.toContain("[Selected slide template priority]");
    expect(runPrompt).not.toContain('The user picked "기본 슬라이드 템플릿"');
  });

  it("treats the L1 plugin id as default even when the catalog title is not Korean", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Simple Deck",
      null,
      "분기 실적",
      null,
      { hasSourceMaterial: false, templateId: CANVAS_CREATE_SLIDES_PLUGIN_ID },
    );
    expect(runPrompt).not.toContain("[Selected slide template]");
    expect(runPrompt).not.toContain("[Selected slide template priority]");
    expect(runPrompt).not.toContain('The user picked "Simple Deck"');
  });

  it("treats the English default title as the L1 template", () => {
    const runPrompt = canvasCreateSlidesRunPrompt("Default slide template", null, null);
    expect(runPrompt).not.toContain("[Selected slide template]");
    expect(runPrompt).not.toContain('The user picked "Default slide template"');
  });

  it("Home freeform without attachments does not say 첨부한 자료", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Html Ppt Zhangzara Daisy Days",
      "User instruction:\nexpo에 대해서 설명하는 피피티 만들어줘.",
      "expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.",
      DEFAULT_CANVAS_SLIDE_QUICK_SETTINGS,
      { hasSourceMaterial: false },
    );
    expect(runPrompt.startsWith("expo에 대해서")).toBe(true);
    expect(runPrompt).not.toContain(CANVAS_CREATE_SLIDES_PROMPT);
    expect(runPrompt).toContain(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    expect(runPrompt).not.toContain(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    expect(runPrompt).toMatch(/There may be no attached source/i);
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toMatch(/expo/i);
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).not.toMatch(/첨부한 자료/);
  });

  it("Home empty request without attachments uses empty-create lead (not 요청한 내용)", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "기본 슬라이드 템플릿",
      null,
      "",
      null,
      { hasSourceMaterial: false },
    );
    expect(runPrompt.startsWith(HOME_EMPTY_CREATE_SLIDES_PROMPT)).toBe(true);
    expect(runPrompt).not.toContain(CANVAS_CREATE_SLIDES_PROMPT);
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).not.toMatch(/요청한 내용으로|첨부한 자료/);
    expect(runPrompt).toContain(HOME_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    expect(runPrompt).not.toMatch(/from the attached source material/);
  });

  it("Home typed request without attachments uses the user text as lead", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "기본 슬라이드 템플릿",
      null,
      "분기 실적 요약 덱",
      null,
      { hasSourceMaterial: false },
    );
    expect(runPrompt.startsWith("분기 실적 요약 덱")).toBe(true);
    expect(runPrompt).not.toContain(HOME_EMPTY_CREATE_SLIDES_PROMPT);
  });

  it("Canvas/Drive with source still uses 첨부한 자료 lead", () => {
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Template",
      "Canvas title: Onboarding",
      "",
      null,
      { hasSourceMaterial: true },
    );
    expect(runPrompt.startsWith(CANVAS_CREATE_SLIDES_PROMPT)).toBe(true);
    // Empty user prompt must not add a dedicated User instruction block.
    expect(runPrompt).not.toMatch(/\n\[User instruction\]\n/);
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
      selectedDeckTemplateId: "html-ppt-hermes",
      selectedDeckTemplateTitle: "Hermes",
      selectedTemplatePriorityInstruction: expect.stringContaining(
        "Selected template visual contract",
      ),
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

    const runPrompt = canvasCreateSlidesRunPrompt(
      "Template",
      "Canvas title: Onboarding brief",
      "",
      quickSettings,
    );
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
    expect(createHomeSlideCreateQuickSettings()).not.toHaveProperty("language");
    expect(createHomeSlideCreateQuickSettings().customSlideCount).toBeNull();
    expect(parseCustomSlideCountInput("")).toBeNull();
    expect(parseCustomSlideCountInput("12")).toBe(12);
    expect(parseCustomSlideCountInput("15")).toBe(15);
    expect(parseCustomSlideCountInput("16")).toBeNull();
    expect(parseCustomSlideCountInput("41")).toBeNull();
    expect(resolveCanvasSlideQuickSlideCount({
      length: "short",
      customSlideCount: 12,
    })).toBe("12");
    expect(resolveCanvasSlideQuickSlideCount(
      { length: "short", customSlideCount: 12 },
      "15 slides",
    )).toBe("15");
    expect(resolveCanvasSlideQuickSlideCount({ length: "detailed" })).toBe("12-15");
    expect(hasHomeSlideCreateContent({ prompt: "", files: [], driveAssets: [] })).toBe(false);
    expect(hasHomeSlideCreateContent({ prompt: "   ", files: [], driveAssets: [] })).toBe(false);
    expect(hasHomeSlideCreateContent({ prompt: "Q3", files: [], driveAssets: [] })).toBe(true);
    expect(hasHomeSlideCreateContent({
      prompt: "",
      files: [new File(["x"], "brief.pdf")],
      driveAssets: [],
    })).toBe(true);
    expect(hasHomeSlideCreateContent({
      prompt: "",
      files: [],
      driveAssets: [{ assetId: "drv-1" }],
    })).toBe(true);
    expect(canvasCreateSlidesPluginInputs("Topic", "Template", "brief")).not.toHaveProperty("outputLanguage");
    expect(canvasCreateSlidesPluginInputs("Topic", "Template", "brief")).not.toHaveProperty("language");
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
    expect(
      canvasCreateSlidesPluginInputs(
        "Topic",
        "Template",
        "brief",
        "",
        { ...quickSettings, customSlideCount: 12 },
      ),
    ).toMatchObject({ slideCount: "12" });
    expect(
      canvasCreateSlidesPluginInputs(
        "Topic",
        "Template",
        "brief",
        "15 slides",
        { ...quickSettings, customSlideCount: 12 },
      ),
    ).toMatchObject({ slideCount: "15" });
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
    const app = readWebSource("src/App.tsx");
    const seeder = readWebSource("src/teamver/seedTemplateClonedDeck.ts");

    expect(composer).toContain("canvasCreateSlidesPluginInputs(");
    expect(composer).toContain("buildSlideOnlyDeckTemplateCreateBinding(");
    expect(composer).toContain("selectedDeckTemplateId");
    expect(composer).toContain("await patchProject(id, projectPatch)");
    expect(projectView).toContain("selectedDeckTemplateId: meta?.selectedDeckTemplateId ?? null");
    expect(projectView).toContain("selectedDeckTemplateTitle: meta?.selectedDeckTemplateTitle ?? null");
    expect(composer).toContain("const sourceBrief = canvasCreateSlidesSourceBrief(handoff)");
    expect(composer).toContain("const sourceBrief = driveCreateSlidesSourceBrief(asset)");
    expect(composer).toContain("promptForRun");
    expect(home).toContain("const sourceBrief = canvasCreateSlidesSourceBrief(canvasSlideLaunch.handoff)");
    expect(home).toContain("const sourceBrief = driveCreateSlidesSourceBrief(asset)");
    expect(home).toContain("canvasSlideUserPrompt");
    expect(projectView).toContain("pluginInputs: fillPluginInputs");
    expect(daemon).toContain("pluginInputs?: Record<string, unknown>;");
    expect(daemon).toContain("{ pluginInputs }");
    // Daemon owns Clone (plugin FS → deck.html); FE only POSTs the endpoint.
    expect(seeder).toContain("/template-clone-deck");
    expect(seeder).toContain("fetchTeamverDaemon");
    expect(seeder).not.toContain("buildTemplateClonedDeckHtml");
    expect(composer).toContain("seedTemplateClonedDeck(");
    expect(composer).toContain("isExplicitCanvasSlideVisualTemplate(selectedCanvasSlideTemplate)");
    expect(composer).toContain("onRequestOpenFile?.(seeded.fileName)");
    expect(app).toContain("seedTemplateClonedDeck(");
    expect(app).not.toContain("skipAutoSendForTemplateClone");
    expect(app).toContain("isExplicitCanvasSlideVisualTemplate({ id: selectedDeckTemplateId })");
    expect(app).toContain("driveCreateSlidesSourceBrief(homeDriveSourceAsset)");
    expect(app).toContain("slideCountHintFromInputs");
    expect(app).toContain("continuing with selected-template AI fill");
    expect(app).toContain("templateClonedDeckSeeded: Boolean(seededDeckFileName) && !preservedFilledDeck");
    expect(app).toContain("selectedDeckTemplateIdFromInputs");
    expect(app).toContain("headings:");
    expect(app).toContain("Home wizard / gallery / community card");
    expect(app).toContain("Drive import failure must NOT skip Clone");
    expect(app).toContain("od:auto-send-first:");
    const appCloneSeedBlock = app.slice(
      app.indexOf("Home wizard / gallery / community card"),
      app.indexOf("try {", app.indexOf("od:auto-send-first:")),
    );
    expect(appCloneSeedBlock).not.toContain("pendingPrompt: null");
    expect(appCloneSeedBlock).not.toContain("pendingPrompt: undefined");
    expect(seeder).toContain("recoverExistingTemplateClonedDeck");
    expect(seeder).toContain("templateClonedDeckSeeded");
    expect(home).toContain("resolveSlideOnlyDeckTemplateSkillId(active?.record)");
    expect(home).toContain("templateForRun");
    expect(home).toContain("confirmHomeSlideCreate");
    expect(home).toContain("teamver.homeCreate.errorTemplateLost");
    expect(home).toContain("teamver.homeCreate.errorCreateFailed");
    const confirmHomeSlideCreateSrc = home.slice(
      home.indexOf("async function confirmHomeSlideCreate"),
      home.indexOf("async function confirmCanvasSlideLaunch"),
    );
    expect(confirmHomeSlideCreateSrc).toContain("hasHomeSlideCreateContent");
    expect(confirmHomeSlideCreateSrc).toContain("pluginTitle: null");
    expect(confirmHomeSlideCreateSrc).not.toContain("pluginTitle: template.title");
    expect(confirmHomeSlideCreateSrc).toContain("sanitizeSlideCreateTopicHint");
    expect(confirmHomeSlideCreateSrc).toContain("teamver.homeCreate.errorCreateFailed");
    expect(confirmHomeSlideCreateSrc).not.toContain("err instanceof Error ? err.message");
    const confirmCanvasSlideLaunchSrc = home.slice(
      home.indexOf("async function confirmCanvasSlideLaunch"),
      home.indexOf("async function submit()"),
    );
    expect(confirmCanvasSlideLaunchSrc).toContain("pluginTitle: null");
    expect(confirmCanvasSlideLaunchSrc).not.toContain("pluginTitle: templateForRun.title");
    expect(confirmCanvasSlideLaunchSrc).toContain("sanitizeSlideCreateTopicHint");
    expect(confirmCanvasSlideLaunchSrc).toContain(
      "formatDriveImportErrorForUser('teamver_workspace_required')",
    );
    expect(confirmCanvasSlideLaunchSrc).not.toContain("작업공간을 먼저");
    expect(home).not.toContain("fromHomeWizard");
    expect(home).toContain("pluginTitle: slideOnlyMvp ? null");
    expect(composer).toContain(
      'formatDriveImportErrorForUser("teamver_workspace_required")',
    );
    expect(composer).not.toContain("작업공간을 먼저");
    expect(home).toContain("templateId: template.id");
    expect(home).toContain("templateId: templateForRun.id");
    expect(home).toContain("selectedDeckTemplateId: template.id");
    expect(home).toContain("User instruction:");
    expect(home).toContain("rememberLastExplicitDeckTemplateId");
    expect(home).toContain("readLastExplicitDeckTemplateId");
    expect(home).toContain("clearLastExplicitDeckTemplateId");
    expect(home).toContain("resetHomeSlideCreateDraft");
    expect(home).toContain("hasSourceMaterial");
    expect(home).not.toContain("rememberLastExplicitDeckTemplateId(homeSlideTemplateId)");
    expect(home).not.toContain("rememberLastExplicitDeckTemplateId(record.id)");
    const launchBoilerplate = readWebSource("src/teamver/slideCreateBoilerplate.ts");
    expect(launchBoilerplate).toContain("CANVAS_CREATE_SLIDES_PROMPT");
    expect(launchBoilerplate).toContain("HOME_CREATE_SLIDES_PROMPT");
    expect(launchBoilerplate).toContain("HOME_EMPTY_CREATE_SLIDES_PROMPT");
    expect(launchBoilerplate).toContain("resolveCreateSlidesLead");
    expect(launchBoilerplate).toContain("briefLooksLikeAttachedSource");
    const resetHomeSlideCreateDraftSrc = home.slice(
      home.indexOf("function resetHomeSlideCreateDraft"),
      home.indexOf("function openHomeSlideCreate"),
    );
    expect(resetHomeSlideCreateDraftSrc).toContain("setStagedFiles([])");
    expect(resetHomeSlideCreateDraftSrc).toContain("setStagedDriveAssets([])");
    expect(resetHomeSlideCreateDraftSrc).toContain("createHomeSlideCreateQuickSettings()");
    expect(resetHomeSlideCreateDraftSrc).toContain("clearLastExplicitDeckTemplateId");
    const openHomeSlideCreateSrc = home.slice(
      home.indexOf("function openHomeSlideCreate"),
      home.indexOf("function closeHomeSlideCreate"),
    );
    expect(openHomeSlideCreateSrc).not.toContain("readLastExplicitDeckTemplateId");
    expect(openHomeSlideCreateSrc).toContain("preserveAttachments");
    expect(openHomeSlideCreateSrc).toContain("setStagedFiles([])");
    expect(openHomeSlideCreateSrc).toContain("setStagedDriveAssets([])");
    expect(openHomeSlideCreateSrc).toContain("createHomeSlideCreateQuickSettings()");
    expect(home).toContain("embedAttachBlockReason");
    expect(home).toContain("openHomeSlideCreate('new', undefined, { preserveAttachments: true })");
    expect(home).toContain("if (!homeSlideCreateOpen) focusPromptAtEnd()");
    expect(home).toContain("{slideOnlyMvp ? (");
    expect(home).toContain("<TeamverHomeCreateHero");
    expect(home).toContain("if (slideOnlyMvp) {\n      if (!homeSlideCreateOpen) openHomeSlideCreate('new');\n      return;");
    const exampleDetail = readWebSource("src/components/plugin-details/PluginExampleDetail.tsx");
    expect(exampleDetail).toContain("hideComposerSeed: hideComposerSeedActions");
    expect(exampleDetail).toContain("Start with this design");
    const homeModal = readWebSource("src/teamver/components/TeamverHomeSlideCreateModal.tsx");
    const canvasModal = readWebSource("src/teamver/components/TeamverCanvasSlideLaunchModal.tsx");
    expect(homeModal).toContain("hasHomeSlideCreateContent");
    expect(homeModal).toContain("customSlideCount");
    expect(homeModal).toContain("teamver-home-slide-create-slide-count");
    expect(homeModal).toContain("teamver.homeCreate.needBriefOrAttach");
    expect(homeModal).toContain("teamver.homeCreate.driveUnavailable");
    expect(homeModal).not.toContain("teamver.homeCreate.quickLanguage");
    expect(canvasModal).not.toContain("teamver.homeCreate.quickLanguage");
    expect(home).toContain("asset.assetId !== assetId");
    expect(home).toContain("item.lastModified === file.lastModified");
    // Composer Canvas/Drive handoff always has source material.
    expect(composer).toContain("hasSourceMaterial: true");
    expect(composer).toContain("templateId: selectedCanvasSlideTemplate.id");
    expect(composer).toContain("sendComposedTurn(");
    expect(composer).toContain("sanitizeTemplateCloneDeckTitle(");
    expect(composer).toContain("slideCountHint: canvasSlideQuickLengthToSlideCount(");
    expect(composer).not.toContain("[...attachments, deckAttachment]");
    expect(composer).toContain("withoutCanonicalDeckAttachments(attachments)");
    expect(composer).toContain("templateCloneContentFill: true");
    expect(composer).toContain("withTemplateCloneFillPluginInputs(");
    expect(composer).not.toContain("blocking model kit fallthrough");
    expect(app).toContain("queuedFillSeed");
    expect(app).toContain("pendingPrompt: queuedFillSeed");
    expect(composer).toContain("Clone LOOK seed is optional. Fill always runs");
    expect(app).toContain("sanitizeTemplateCloneDeckTitle(");
    expect(projectView).toContain("resolveTemplateCloneAutoSendSeed(");
    expect(projectView).toContain("isCloneContentFillTurn");
    expect(projectView).toContain("withoutCanonicalDeckAttachments(");
    expect(projectView).toContain("autoAttachedDeckPath = null");
    expect(projectView).toContain("allowCompactReplacement: runTemplateCloneContentFillRef.current");
    expect(projectView).toContain("allowSlideCountReduction: runTemplateCloneContentFillRef.current");
    expect(projectView).toContain("skipArtifactStubGuard: true");
    expect(projectView).toMatch(/runTemplateCloneContentFillRef\.current[\s\S]{0,120}skipArtifactStubGuard:\s*true/);
    expect(projectView).toContain("templateCloneFillSlideCountOverrideNotice(");
    expect(projectView).toContain("slimTemplateVisualKitForFill(");
    expect(projectView).toContain("templateCloneContentFill: isCloneContentFillTurn");
    expect(projectView).toContain("deckArtifactStartsWithMotifSvgDump");
    expect(projectView).toContain("shouldAbortStreamForMotifSvgDump");
    expect(projectView).toContain("shouldAbortStreamForHeadOnlyKitDump");
    expect(projectView).toContain("FILL_MOTIF_SVG_DUMP_STOP_REASON");
    expect(projectView).toContain("FILL_HEAD_KIT_DUMP_STOP_REASON");
    expect(projectView).toContain("stripAbandonedMotifSvgDumpFromStreamedText");
    expect(projectView).toContain("stripAbandonedHeadKitDumpFromStreamedText");
    expect(projectView).toContain("templateCloneContentFill: true");
    expect(projectView).toMatch(/includeExistingDeckImageEditRule:\s*\n\s*!isCloneContentFillTurn/);
    expect(projectView).toContain("templateCloneContentFill: autoContinueOriginIsFill");
    expect(projectView).toContain("ensureTemplateCloneContentFillContinuePrompt(");
    expect(app).toContain("withoutCanonicalDeckAttachments(");
    const fillSrc = readWebSource("src/teamver/templateCloneContentFill.ts");
    expect(fillSrc).toContain("withoutCanonicalDeckAttachments(");
    expect(fillSrc).toContain("isCanonicalDeckAttachment(");
    expect(fillSrc).toContain("withTemplateCloneFillPluginInputs(");
    expect(fillSrc).toContain("`<head>` is FORBIDDEN on this fill turn");
    expect(fillSrc).toContain("first 800 characters after `<artifact`");
    expect(fillSrc).toContain("close exactly 3 complete body-first slides");
    expect(fillSrc).toContain("Motif SVG is NOT required this turn");
    expect(projectView).not.toMatch(/lastResortTitle:\s*[\s\S]{0,120}'초안'/);
    expect(fillSrc).toContain("SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION");
    expect(fillSrc).toContain("BRIEF/TOPIC");
    const tabsBar = readWebSource("src/components/WorkspaceTabsBar.tsx");
    expect(tabsBar).toContain("stripUserVisibleUserMessageText(");
    expect(tabsBar).not.toContain("stripUserVisibleQuestionFormProtocolText(");
    const entryShell = readWebSource("src/components/EntryShell.tsx");
    expect(entryShell).toContain("payloadTemplateId");
    expect(entryShell).toContain("selectedDeckTemplateId: payloadTemplateId");
    // Project titles come from user prompt / pluginInputs.topic — not template marketing names.
    expect(entryShell).toContain("topicFromPluginInputs");
    expect(entryShell).toContain("pluginTitle: null");
    // Drive import fail must not skip Clone for explicit templates.
    expect(app).not.toContain("pendingDriveAssets.length === 0 || homeDriveImportSucceeded");
    const launch = readWebSource("src/teamver/canvasSlideLaunch.ts");
    expect(launch).toContain("LAST_EXPLICIT_DECK_TEMPLATE_KEY");
    expect(launch).toContain("clearLastExplicitDeckTemplateId");
    expect(launch).toContain('from "./slideCreateBoilerplate"');
    expect(launch).toContain("briefLooksLikeAttachedSource(brief)");
    const bundled = readFileSync(
      resolve(__dirname, "../../daemon/src/plugins/bundled.ts"),
      "utf8",
    );
    expect(bundled).toContain("normalizeBundledPluginLookupId");
    const projectRoutes = readFileSync(
      resolve(__dirname, "../../daemon/src/project-routes.ts"),
      "utf8",
    );
    expect(projectRoutes).toContain("/api/projects/:id/template-clone-deck");
    expect(projectRoutes).toContain("seedTemplateClonedDeckOnServer");
    expect(projectRoutes).toContain("persistAfterMutation");
    // Persist flake must not 502 the clone (model fallback would wipe look).
    expect(projectRoutes).toContain("scheduling async sync");
    expect(projectRoutes).toContain("ensureBundledPluginForClone");
    expect(projectRoutes).toContain("markTemplateClonedDeckSeeded");
    expect(projectRoutes).toContain("templateClonedDeckSeeded: true");
    // Chat seed wiring stays available for clone routes; fake completed-ack seeding
    // was removed so AI content-fill owns the first transcript turn.
    expect(projectRoutes).toContain("'conversations' | 'ids'");
    expect(projectRoutes).toContain("listConversationsAsync");
    expect(projectRoutes).toContain("insertConversationAsync");
    expect(projectRoutes).toContain("Template-clone chat seed lives in file routes");
    const daemonServer = readFileSync(
      resolve(__dirname, "../../daemon/src/server.ts"),
      "utf8",
    );
    const fileRoutesCall = daemonServer.slice(
      daemonServer.indexOf("registerProjectFileRoutes(app,"),
      daemonServer.indexOf("registerMediaRoutes(app,"),
    );
    expect(fileRoutesCall).toContain("conversations: conversationDeps");
    expect(fileRoutesCall).toContain("ids: idDeps");
    const cloneSrc = readFileSync(
      resolve(__dirname, "../../daemon/src/template-clone-deck.ts"),
      "utf8",
    );
    expect(cloneSrc).toContain("skipArtifactStubGuard: true");
    expect(cloneSrc).toContain("skipArtifactPublicationGuard: true");
    expect(projectView).not.toContain("Clone already wrote deck.html");
    expect(projectView).not.toContain("templateClonedDeckSeeded === true");
  });

  it("does not optimistic-bump project updatedAt when pinning entryFile on open", () => {
    const projectView = readWebSource("src/components/ProjectView.tsx");
    const finalizeSrc = projectView.slice(
      projectView.indexOf("const finalizeSlideOnlyDeckArtifacts = useCallback"),
      projectView.indexOf("finalizeSlideOnlyDeckArtifactsRef.current = finalizeSlideOnlyDeckArtifacts"),
    );
    expect(finalizeSrc).toContain("Do not optimistic-bump updatedAt");
    expect(finalizeSrc).toContain("updatedAt: project.updatedAt");
    expect(finalizeSrc).toContain("if (patched) onProjectChange(patched)");
    expect(finalizeSrc).not.toContain("updatedAt: Date.now()");
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
