import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 173 (webkit-margin logical)", () => {
  it("copies webkit-margin logical", () => {
    const html = [
      '<section class="slide" style="-webkit-margin-before:8px;-webkit-margin-after:4px;-webkit-margin-start:2px;-webkit-margin-end:2px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-margin-before:\s*8px/i);
    expect(flow).toMatch(/-webkit-margin-after:\s*4px/i);
    expect(flow).toMatch(/-webkit-margin-start:\s*2px/i);
    expect(flow).toMatch(/-webkit-margin-end:\s*2px/i);
  });
});
