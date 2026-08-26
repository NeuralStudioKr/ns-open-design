import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 205 (set25-26 combo)", () => {
  it("copies set25-26 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-timing-function:linear;-webkit-text-emphasis-style:filled;-webkit-box-sizing:border-box;-webkit-border-vertical-spacing:3px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-timing-function:\s*linear/i);
    expect(flow).toMatch(/-webkit-text-emphasis-style:\s*filled/i);
    expect(flow).toMatch(/-webkit-box-sizing:\s*border-box/i);
    expect(flow).toMatch(/-webkit-border-vertical-spacing:\s*3px/i);
  });
});
