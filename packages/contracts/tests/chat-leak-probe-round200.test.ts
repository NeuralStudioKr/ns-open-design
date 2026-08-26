import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 200 (webkit-border-spacing)", () => {
  it("copies webkit-border-spacing", () => {
    const html = [
      '<section class="slide" style="-webkit-border-horizontal-spacing:4px;-webkit-border-vertical-spacing:6px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-horizontal-spacing:\s*4px/i);
    expect(flow).toMatch(/-webkit-border-vertical-spacing:\s*6px/i);
  });
});
