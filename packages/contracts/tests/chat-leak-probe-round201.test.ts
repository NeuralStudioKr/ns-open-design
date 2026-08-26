import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 201 (set25 combo)", () => {
  it("copies set25 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-delay:.1s;-webkit-text-emphasis-color:navy;-webkit-box-sizing:content-box;-webkit-border-horizontal-spacing:2px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-delay:\s*\.1s/i);
    expect(flow).toMatch(/-webkit-text-emphasis-color:\s*navy/i);
    expect(flow).toMatch(/-webkit-box-sizing:\s*content-box/i);
    expect(flow).toMatch(/-webkit-border-horizontal-spacing:\s*2px/i);
  });
});
