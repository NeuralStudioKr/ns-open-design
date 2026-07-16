import { describe, expect, it } from "vitest";

import {
  CANVAS_CREATE_SLIDES_PLUGIN_ID,
  CANVAS_CREATE_SLIDES_PROMPT,
  isCanvasSlideOneConfirmLaunch,
} from "../src/teamver/canvasSlideLaunch";

describe("canvasSlideLaunch", () => {
  it("exports the slide-generation prompt for Canvas handoff", () => {
    expect(CANVAS_CREATE_SLIDES_PROMPT).toMatch(/multi-slide|presentation deck/i);
    expect(CANVAS_CREATE_SLIDES_PROMPT).toMatch(/source|not.*deliverable|do NOT use/i);
    expect(CANVAS_CREATE_SLIDES_PROMPT.length).toBeGreaterThan(20);
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
