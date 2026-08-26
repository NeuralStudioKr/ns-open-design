import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 70 — physical scroll-padding/margin and overflow-block flow copy.
 */
describe("chat leak / persist probe round 70 (scroll-padding-top · overflow-block)", () => {
  it("copies physical scroll-* and overflow-block into slide flow", () => {
    const html = [
      '<section class="slide" style="scroll-padding-top:1px;scroll-padding-right:2px;scroll-padding-bottom:3px;scroll-padding-left:4px;scroll-margin-top:5px;scroll-margin-right:6px;scroll-margin-bottom:7px;scroll-margin-left:8px;overscroll-behavior-block:contain;overscroll-behavior-inline:none;overflow-block:auto;overflow-inline:clip;block-overflow:ellipsis;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/scroll-padding-top:\s*1px/i);
    expect(flowOpen).toMatch(/scroll-padding-right:\s*2px/i);
    expect(flowOpen).toMatch(/scroll-padding-bottom:\s*3px/i);
    expect(flowOpen).toMatch(/scroll-padding-left:\s*4px/i);
    expect(flowOpen).toMatch(/scroll-margin-top:\s*5px/i);
    expect(flowOpen).toMatch(/scroll-margin-left:\s*8px/i);
    expect(flowOpen).toMatch(/overscroll-behavior-block:\s*contain/i);
    expect(flowOpen).toMatch(/overscroll-behavior-inline:\s*none/i);
    expect(flowOpen).toMatch(/overflow-block:\s*auto/i);
    expect(flowOpen).toMatch(/overflow-inline:\s*clip/i);
    expect(flowOpen).toMatch(/block-overflow:\s*ellipsis/i);
  });
});
