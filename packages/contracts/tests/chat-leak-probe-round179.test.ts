import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 179 (set19-20 combo)", () => {
  it("copies set19-20 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-touch-callout:none;-webkit-column-break-before:always;-webkit-padding-start:6px;-webkit-background-origin:content-box;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-touch-callout:\s*none/i);
    expect(flow).toMatch(/-webkit-column-break-before:\s*always/i);
    expect(flow).toMatch(/-webkit-padding-start:\s*6px/i);
    expect(flow).toMatch(/-webkit-background-origin:\s*content-box/i);
  });
});
