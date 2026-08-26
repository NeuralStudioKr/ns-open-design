import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 125 (mask/filter/transform combo)", () => {
  it("copies webkit mask, filter, and transform together", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-image:url(a.png);-webkit-filter:grayscale(1);-webkit-transform:rotate(2deg);-webkit-backdrop-filter:blur(4px);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-image:\s*url\(a\.png\)/i);
    expect(flow).toMatch(/-webkit-filter:\s*grayscale\(1\)/i);
    expect(flow).toMatch(/-webkit-transform:\s*rotate\(2deg\)/i);
    expect(flow).toMatch(/-webkit-backdrop-filter:\s*blur\(4px\)/i);
  });
});
