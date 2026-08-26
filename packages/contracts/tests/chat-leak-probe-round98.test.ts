import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 98 (hyphenate-limit-before/after)", () => {
  it("copies hyphenate-limit-before and after", () => {
    const html = [
      '<section class="slide" style="hyphenate-limit-before:2;hyphenate-limit-after:3;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/hyphenate-limit-before:\s*2/i);
    expect(flow).toMatch(/hyphenate-limit-after:\s*3/i);
  });
});
