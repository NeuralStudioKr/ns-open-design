import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 244 (set34 combo)", () => {
  it("copies set34 combo", () => {
    const html = [
      '<section class="slide" style="-moz-border-radius:2px;-moz-box-flex:1;-moz-orient:inline;-moz-box-sizing:content-box;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-border-radius:\s*2px/i);
    expect(flow).toMatch(/-moz-box-flex:\s*1/i);
    expect(flow).toMatch(/-moz-orient:\s*inline/i);
    expect(flow).toMatch(/-moz-box-sizing:\s*content-box/i);
  });
});
