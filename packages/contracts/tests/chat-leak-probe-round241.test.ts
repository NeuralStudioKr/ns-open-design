import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 241 (moz-border-radius)", () => {
  it("copies moz-border-radius", () => {
    const html = [
      '<section class="slide" style="-moz-border-radius:8px;-moz-border-radius-topleft:4px;-moz-border-radius-topright:3px;-moz-border-radius-bottomright:2px;-moz-border-radius-bottomleft:1px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-border-radius:\s*8px/i);
    expect(flow).toMatch(/-moz-border-radius-topleft:\s*4px/i);
    expect(flow).toMatch(/-moz-border-radius-topright:\s*3px/i);
    expect(flow).toMatch(/-moz-border-radius-bottomright:\s*2px/i);
    expect(flow).toMatch(/-moz-border-radius-bottomleft:\s*1px/i);
  });
});
