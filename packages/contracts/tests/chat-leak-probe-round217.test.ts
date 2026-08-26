import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 217 (hyphenate-limit last/zone)", () => {
  it("copies webkit hyphenate-limit last/zone", () => {
    const html = [
      '<section class="slide" style="-webkit-hyphenate-limit-last:always;-webkit-hyphenate-limit-zone:8%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-hyphenate-limit-last:\s*always/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-zone:\s*8%/i);
  });
});
