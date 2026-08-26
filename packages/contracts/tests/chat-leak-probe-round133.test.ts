import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 133 (set10–11 combo)", () => {
  it("copies mask, flex, columns, and print-color together", () => {
    const html = [
      '<section class="slide" style="-webkit-mask:url(a.png);-webkit-flex-direction:column;-webkit-column-count:2;-webkit-print-color-adjust:exact;-webkit-transform:translateY(4px);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask:\s*url\(a\.png\)/i);
    expect(flow).toMatch(/-webkit-flex-direction:\s*column/i);
    expect(flow).toMatch(/-webkit-column-count:\s*2/i);
    expect(flow).toMatch(/-webkit-print-color-adjust:\s*exact/i);
    expect(flow).toMatch(/-webkit-transform:\s*translateY\(4px\)/i);
  });
});
