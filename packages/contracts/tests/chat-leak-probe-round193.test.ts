import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 193 (set22 transform+flex)", () => {
  it("copies transform-style with flex-wrap", () => {
    const html = [
      '<section class="slide" style="-webkit-transform-style:preserve-3d;-webkit-flex-wrap:wrap;-webkit-font-size-adjust:0.6;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transform-style:\s*preserve-3d/i);
    expect(flow).toMatch(/-webkit-flex-wrap:\s*wrap/i);
    expect(flow).toMatch(/-webkit-font-size-adjust:\s*0\.6/i);
  });
});
