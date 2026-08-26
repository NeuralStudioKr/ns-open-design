import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 176 (webkit-padding logical)", () => {
  it("copies webkit-padding logical", () => {
    const html = [
      '<section class="slide" style="-webkit-padding-before:12px;-webkit-padding-after:8px;-webkit-padding-start:4px;-webkit-padding-end:4px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-padding-before:\s*12px/i);
    expect(flow).toMatch(/-webkit-padding-after:\s*8px/i);
    expect(flow).toMatch(/-webkit-padding-start:\s*4px/i);
    expect(flow).toMatch(/-webkit-padding-end:\s*4px/i);
  });
});
