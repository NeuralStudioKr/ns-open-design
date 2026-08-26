import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 230 (set31 combo)", () => {
  it("copies set31 combo", () => {
    const html = [
      '<section class="slide" style="-ms-flex:1;-ms-grid-column:1;-moz-background-size:contain;-ms-flex-direction:row;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-flex:\s*1/i);
    expect(flow).toMatch(/-ms-grid-column:\s*1/i);
    expect(flow).toMatch(/-moz-background-size:\s*contain/i);
    expect(flow).toMatch(/-ms-flex-direction:\s*row/i);
  });
});
