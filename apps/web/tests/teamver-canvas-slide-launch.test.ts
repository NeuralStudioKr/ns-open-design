import { describe, expect, it } from "vitest";

import {
  CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  CANVAS_CREATE_SLIDES_PROMPT,
  canvasCreateSlidesPluginInputs,
  canvasCreateSlidesRunPrompt,
  isCanvasSlideOneConfirmLaunch,
} from "../src/teamver/canvasSlideLaunch";
import { stripUserVisibleQuestionFormProtocolText } from "../src/artifacts/question-form";

describe("canvasSlideLaunch", () => {
  it("keeps the user-visible Canvas handoff prompt short", () => {
    expect(CANVAS_CREATE_SLIDES_PROMPT).toContain("슬라이드");
    expect(CANVAS_CREATE_SLIDES_PROMPT).not.toMatch(/Build a new multi-slide|do NOT use/i);
  });

  it("keeps source handling rules in plugin inputs instead of the chat bubble", () => {
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/multi-slide|presentation deck/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/source|not.*deliverable|do NOT use/i);
    expect(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION).toMatch(/write\/save|complete \.html deck file/i);
    expect(canvasCreateSlidesPluginInputs("canvas", "Template")).toMatchObject({
      topic: "canvas",
      designSystem: "Template",
      sourceHandlingInstruction: CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION,
    });
  });

  it("sends hidden deliverable instructions to the model while keeping user display clean", () => {
    const runPrompt = canvasCreateSlidesRunPrompt("Hermes Cyber Terminal");
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_PROMPT);
    expect(runPrompt).toContain(CANVAS_CREATE_SLIDES_INTERNAL_INSTRUCTION);
    expect(runPrompt).toContain("Selected slide template/style: Hermes Cyber Terminal.");
    expect(stripUserVisibleQuestionFormProtocolText(runPrompt)).toBe(CANVAS_CREATE_SLIDES_PROMPT);
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
});
