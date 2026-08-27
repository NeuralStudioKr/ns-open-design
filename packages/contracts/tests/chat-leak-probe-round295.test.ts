import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 295 (set44 combo)", () => {
  it("copies set44 combo", () => {
    const html = [
      '<section class="slide" style="view-transition-class:x;-ms-content-zoom-chaining:chained;-webkit-border-fit:border;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/view-transition-class:\s*x/i);
    expect(flow).toMatch(/-ms-content-zoom-chaining:\s*chained/i);
    expect(flow).toMatch(/-webkit-border-fit:\s*border/i);
  });
});
