import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  CANVAS_CREATE_SLIDES_PROMPT,
  canvasCreateSlidesPluginInputs,
  canvasCreateSlidesProjectMetadata,
  canvasCreateSlidesRunPrompt,
  canvasCreateSlidesSourceBrief,
  canvasCreateSlidesTurnMeta,
  formatCanvasDeckSlideCountInput,
  inferCanvasDeckSlideCount,
  isCanvasSlideOneConfirmLaunch,
} from "../src/teamver/canvasSlideLaunch";
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
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/artifact type="deck"|compact deck/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/slideCount|requested slide count/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).not.toMatch(/simple-deck|1920|nav, and print/i);
    expect(canvasCreateSlidesPluginInputs("canvas", "Template")).toMatchObject({
      topic: "canvas",
      designSystem: "Template",
      sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
    });
    expect(canvasCreateSlidesPluginInputs("canvas", "Template")).not.toHaveProperty("slideCount");
    expect(
      canvasCreateSlidesPluginInputs("canvas", "Template", null, {
        sectionCount: 12,
        headings: ["A", "B"],
      }),
    ).toMatchObject({ slideCount: formatCanvasDeckSlideCountInput(12) });
    expect(inferCanvasDeckSlideCount({ sectionCount: 0, headings: ["Only", "Two"] })).toBe(2);
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

  it("sends hidden deliverable instructions to the model while keeping user display clean", () => {
    const handoff = { sectionCount: 10, headings: ["Intro"] };
    const runPrompt = canvasCreateSlidesRunPrompt(
      "Hermes Cyber Terminal",
      "Canvas title: Onboarding\nSource preview: Keep onboarding sections.",
      handoff,
    );
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_PROMPT);
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    expect(runPrompt).toContain("Selected slide template/style: Hermes Cyber Terminal.");
    expect(runPrompt).toContain("Target slide count from canvas structure: 10 slides.");
    expect(runPrompt).toContain("[Source brief]");
    expect(runPrompt).toContain("Canvas title: Onboarding");
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toBe(CANVAS_CREATE_SLIDES_PROMPT);
  });

  it("stamps slideCount on deck project metadata when canvas outline is known", () => {
    expect(canvasCreateSlidesProjectMetadata({ sectionCount: 8, headings: [] })).toEqual({
      kind: "deck",
      skipDiscoveryBrief: true,
      slideCount: "8 slides",
    });
    expect(canvasCreateSlidesProjectMetadata(null)).toEqual({
      kind: "deck",
      skipDiscoveryBrief: true,
    });
  });

  it("binds selected deck template into per-turn skillIds for system prompt composition", () => {
    expect(canvasCreateSlidesTurnMeta("example-simple-deck", { designSystemId: "ds-1" })).toEqual({
      skillIds: ["example-simple-deck"],
      designSystemId: "ds-1",
      context: {
        pluginIds: ["example-simple-deck"],
        skillIds: ["example-simple-deck"],
      },
    });
    expect(
      canvasCreateSlidesTurnMeta("example-simple-deck", {
        mergeContext: { pluginIds: ["other-plugin"], skillIds: ["staged-skill"] },
      }),
    ).toEqual({
      skillIds: ["example-simple-deck"],
      context: {
        pluginIds: ["example-simple-deck", "other-plugin"],
        skillIds: ["example-simple-deck", "staged-skill"],
      },
    });
  });

  it("binds create-slides to the deck scenario plugin", () => {
    expect(CANVAS_CREATE_SLIDES_PLUGIN_ID).toBe("example-simple-deck");
  });

  it("detects create-slides one-confirm launches", () => {
    const asset = { assetId: "AST-1", filename: "canvas.html" };
    expect(isCanvasSlideOneConfirmLaunch("create-slides", asset)).toBe(true);
    expect(isCanvasSlideOneConfirmLaunch(null, asset)).toBe(false);
    expect(isCanvasSlideOneConfirmLaunch("create-slides", null)).toBe(false);
  });

  it("threads plugin inputs through the existing-project composer handoff", () => {
    const composer = readWebSource("src/components/ChatComposer.tsx");
    const home = readWebSource("src/components/HomeView.tsx");
    const projectView = readWebSource("src/components/ProjectView.tsx");
    const daemon = readWebSource("src/providers/daemon.ts");

    expect(composer).toContain("pluginInputs: canvasCreateSlidesPluginInputs(");
    expect(composer).toContain("const sourceBrief = canvasCreateSlidesSourceBrief(canvasSlideLaunch.handoff)");
    expect(composer).toContain("canvasCreateSlidesRunPrompt(");
    expect(composer).toContain("canvasSlideLaunch.handoff");
    expect(home).toContain("canvasCreateSlidesRunPrompt(");
    expect(home).toContain("canvasCreateSlidesProjectMetadata(canvasSlideLaunch.handoff)");
    expect(projectView).toContain("pluginInputs: meta?.pluginInputs");
    expect(daemon).toContain("pluginInputs?: Record<string, unknown>;");
    expect(daemon).toContain("{ pluginInputs }");
  });
});
