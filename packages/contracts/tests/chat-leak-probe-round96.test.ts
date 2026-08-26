import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 96 (scroll/view-timeline shorthand)", () => {
  it("copies scroll-timeline and view-timeline shorthands", () => {
    const html = [
      '<section class="slide" style="scroll-timeline:--sc inline;view-timeline:--vt block;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/scroll-timeline:\s*--sc inline/i);
    expect(flow).toMatch(/view-timeline:\s*--vt block/i);
  });
});
