import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 185 (set22 combo)", () => {
  it("copies set22 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-transform-origin:left top;-webkit-opacity:0.9;-webkit-writing-mode:horizontal-tb;-webkit-font-size-adjust:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transform-origin:\s*left top/i);
    expect(flow).toMatch(/-webkit-opacity:\s*0\.9/i);
    expect(flow).toMatch(/-webkit-writing-mode:\s*horizontal-tb/i);
    expect(flow).toMatch(/-webkit-font-size-adjust:\s*none/i);
  });
});
