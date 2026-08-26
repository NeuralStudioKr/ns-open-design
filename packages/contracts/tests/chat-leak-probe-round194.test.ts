import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 194 (set22-23 combo)", () => {
  it("copies set22-23 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-perspective-origin:20% 30%;-webkit-flex-grow:2;-webkit-text-combine-upright:all;-webkit-opacity:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-perspective-origin:\s*20% 30%/i);
    expect(flow).toMatch(/-webkit-flex-grow:\s*2/i);
    expect(flow).toMatch(/-webkit-text-combine-upright:\s*all/i);
    expect(flow).toMatch(/-webkit-opacity:\s*1/i);
  });
});
