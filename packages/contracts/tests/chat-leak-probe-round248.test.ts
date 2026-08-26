import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 248 (moz-perspective opacity transform-style)", () => {
  it("copies moz-perspective opacity transform-style", () => {
    const html = [
      '<section class="slide" style="-moz-perspective:800px;-moz-perspective-origin:50% 50%;-moz-transform-style:preserve-3d;-moz-opacity:0.9;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-perspective:\s*800px/i);
    expect(flow).toMatch(/-moz-perspective-origin:\s*50%\s*50%/i);
    expect(flow).toMatch(/-moz-transform-style:\s*preserve-3d/i);
    expect(flow).toMatch(/-moz-opacity:\s*0\.9/i);
  });
});
