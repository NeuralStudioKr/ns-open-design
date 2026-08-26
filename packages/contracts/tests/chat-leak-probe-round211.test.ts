import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 211 (webkit border-radius longhands)", () => {
  it("copies webkit corner radii", () => {
    const html = [
      '<section class="slide" style="-webkit-border-top-left-radius:8px;-webkit-border-top-right-radius:6px;-webkit-border-bottom-right-radius:4px;-webkit-border-bottom-left-radius:2px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-top-left-radius:\s*8px/i);
    expect(flow).toMatch(/-webkit-border-top-right-radius:\s*6px/i);
    expect(flow).toMatch(/-webkit-border-bottom-right-radius:\s*4px/i);
    expect(flow).toMatch(/-webkit-border-bottom-left-radius:\s*2px/i);
  });
});
