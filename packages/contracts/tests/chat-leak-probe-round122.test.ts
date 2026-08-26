import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 122 (webkit-mask clip/origin)", () => {
  it("copies -webkit-mask clip/origin/composite/box-image", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-clip:border-box;-webkit-mask-origin:padding-box;-webkit-mask-composite:source-over;-webkit-mask-box-image:url(c.png) 10 fill;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-clip:\s*border-box/i);
    expect(flow).toMatch(/-webkit-mask-origin:\s*padding-box/i);
    expect(flow).toMatch(/-webkit-mask-composite:\s*source-over/i);
    expect(flow).toMatch(/-webkit-mask-box-image:\s*url\(c\.png\) 10 fill/i);
  });
});
