import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 308 (region break harden)", () => {
  it("copies region break harden", () => {
    const html = [
      '<section class="slide" style="-webkit-region-break-after:auto;-webkit-region-break-before:auto;-webkit-region-break-inside:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-region-break-after:\s*auto/i);
    expect(flow).toMatch(/-webkit-region-break-before:\s*auto/i);
    expect(flow).toMatch(/-webkit-region-break-inside:\s*auto/i);
  });
});
