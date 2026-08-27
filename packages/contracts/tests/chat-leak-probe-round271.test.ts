import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 271 (line-grid align snap trailing)", () => {
  it("copies line-grid align snap trailing", () => {
    const html = [
      '<section class="slide" style="-webkit-line-align:edge;-webkit-line-grid:a;-webkit-line-snap:baseline;-webkit-cursor-visibility:auto;-webkit-trailing-word:auto;-apple-trailing-word:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-line-align:\s*edge/i);
    expect(flow).toMatch(/-webkit-line-grid:\s*a/i);
    expect(flow).toMatch(/-webkit-line-snap:\s*baseline/i);
    expect(flow).toMatch(/-webkit-cursor-visibility:\s*auto/i);
    expect(flow).toMatch(/-webkit-trailing-word:\s*auto/i);
    expect(flow).toMatch(/-apple-trailing-word:\s*auto/i);
  });
});
