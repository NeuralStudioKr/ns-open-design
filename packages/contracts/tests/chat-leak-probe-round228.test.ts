import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 228 (ms-grid)", () => {
  it("copies ms-grid", () => {
    const html = [
      '<section class="slide" style="-ms-grid-columns:1fr 1fr;-ms-grid-rows:auto;-ms-grid-column:1;-ms-grid-row:2;-ms-grid-column-span:2;-ms-grid-row-span:1;-ms-grid-column-align:center;-ms-grid-row-align:start;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-grid-columns:\s*1fr 1fr/i);
    expect(flow).toMatch(/-ms-grid-rows:\s*auto/i);
    expect(flow).toMatch(/-ms-grid-column:\s*1/i);
    expect(flow).toMatch(/-ms-grid-row:\s*2/i);
    expect(flow).toMatch(/-ms-grid-column-span:\s*2/i);
    expect(flow).toMatch(/-ms-grid-row-span:\s*1/i);
    expect(flow).toMatch(/-ms-grid-column-align:\s*center/i);
    expect(flow).toMatch(/-ms-grid-row-align:\s*start/i);
  });
});
