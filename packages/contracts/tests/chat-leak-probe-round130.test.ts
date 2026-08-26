import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 130 (perspective / overflow-scrolling)", () => {
  it("copies webkit perspective, backface, overflow-scrolling, border-radius", () => {
    const html = [
      '<section class="slide" style="-webkit-perspective:800px;-webkit-backface-visibility:hidden;-webkit-overflow-scrolling:touch;-webkit-border-radius:12px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-perspective:\s*800px/i);
    expect(flow).toMatch(/-webkit-backface-visibility:\s*hidden/i);
    expect(flow).toMatch(/-webkit-overflow-scrolling:\s*touch/i);
    expect(flow).toMatch(/-webkit-border-radius:\s*12px/i);
  });
});
