import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 86 (text-anchor · kerning)", () => {
  it("copies text-anchor/kerning/glyph-orientation into slide flow", () => {
    const html = [
      '<section class="slide" style="text-anchor:middle;kerning:auto;glyph-orientation-vertical:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/text-anchor:\s*middle/i);
    expect(flow).toMatch(/kerning:\s*auto/i);
    expect(flow).toMatch(/glyph-orientation-vertical:\s*auto/i);
  });
});
