import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 265 (set38 combo)", () => {
  it("copies set38 combo", () => {
    const html = [
      '<section class="slide" style="-ms-scrollbar-face-color:#ccc;-webkit-column-rule-color:navy;-moz-font-smoothing:grayscale;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-scrollbar-face-color:\s*#ccc/i);
    expect(flow).toMatch(/-webkit-column-rule-color:\s*navy/i);
    expect(flow).toMatch(/-moz-font-smoothing:\s*grayscale/i);
  });
});
