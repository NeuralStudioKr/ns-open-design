import { describe, expect, it } from "vitest";

import {
  CANVAS_CREATE_SLIDES_PROMPT,
  isCanvasSlideOneConfirmLaunch,
} from "../src/teamver/canvasSlideLaunch";

describe("canvasSlideLaunch", () => {
  it("exports the slide-generation prompt for Canvas handoff", () => {
    expect(CANVAS_CREATE_SLIDES_PROMPT).toContain("presentation");
    expect(CANVAS_CREATE_SLIDES_PROMPT.length).toBeGreaterThan(20);
  });

  it("detects create-slides one-confirm launches", () => {
    const asset = { assetId: "AST-1", filename: "canvas.html" };
    expect(isCanvasSlideOneConfirmLaunch("create-slides", asset)).toBe(true);
    expect(isCanvasSlideOneConfirmLaunch(null, asset)).toBe(false);
    expect(isCanvasSlideOneConfirmLaunch("create-slides", null)).toBe(false);
  });
});
