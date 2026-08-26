import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 105 (set5 combo regression)", () => {
  it("copies timeline, clamp, palette, and print props together", () => {
    const html = [
      '<section class="slide" style="scroll-timeline:--s inline;view-timeline:--v block;-webkit-line-clamp:2;color-adjust:exact;base-palette:1;override-colors:0 blue;page:cover;marks:cross;shape-inside:display;calc-size:auto;hyphenate-limit-before:1;hyphenate-limit-after:2;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/scroll-timeline:\s*--s inline/i);
    expect(flow).toMatch(/view-timeline:\s*--v block/i);
    expect(flow).toMatch(/-webkit-line-clamp:\s*2/i);
    expect(flow).toMatch(/color-adjust:\s*exact/i);
    expect(flow).toMatch(/base-palette:\s*1/i);
    expect(flow).toMatch(/override-colors:\s*0 blue/i);
    expect(flow).toMatch(/page:\s*cover/i);
    expect(flow).toMatch(/marks:\s*cross/i);
    expect(flow).toMatch(/shape-inside:\s*display/i);
    expect(flow).toMatch(/calc-size:\s*auto/i);
    expect(flow).toMatch(/hyphenate-limit-before:\s*1/i);
    expect(flow).toMatch(/hyphenate-limit-after:\s*2/i);
  });
});
