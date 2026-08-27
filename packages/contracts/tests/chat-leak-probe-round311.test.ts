import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 311 (shape padding threshold)", () => {
  it("copies shape padding threshold", () => {
    const html = [
      '<section class="slide" style="-webkit-shape-padding:0;-webkit-shape-image-threshold:0;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-shape-padding:\s*0/i);
    expect(flow).toMatch(/-webkit-shape-image-threshold:\s*0/i);
  });
});
