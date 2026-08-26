import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 175 (column-break+hyphenate combo)", () => {
  it("copies column-break+hyphenate combo", () => {
    const html = [
      '<section class="slide" style="-webkit-column-break-inside:avoid;-webkit-hyphenate-limit-lines:1;-webkit-margin-before:1px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-column-break-inside:\s*avoid/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-lines:\s*1/i);
    expect(flow).toMatch(/-webkit-margin-before:\s*1px/i);
  });
});
