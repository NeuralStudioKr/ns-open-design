import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 171 (webkit-column-break)", () => {
  it("copies webkit-column-break", () => {
    const html = [
      '<section class="slide" style="-webkit-column-break-before:always;-webkit-column-break-after:avoid;-webkit-column-break-inside:avoid;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-column-break-before:\s*always/i);
    expect(flow).toMatch(/-webkit-column-break-after:\s*avoid/i);
    expect(flow).toMatch(/-webkit-column-break-inside:\s*avoid/i);
  });
});
