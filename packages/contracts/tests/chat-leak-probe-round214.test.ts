import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 214 (mask-box-image longhands)", () => {
  it("copies webkit mask-box-image longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-box-image-source:none;-webkit-mask-box-image-slice:10;-webkit-mask-box-image-width:2px;-webkit-mask-box-image-outset:1px;-webkit-mask-box-image-repeat:round;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-box-image-source:\s*none/i);
    expect(flow).toMatch(/-webkit-mask-box-image-slice:\s*10/i);
    expect(flow).toMatch(/-webkit-mask-box-image-width:\s*2px/i);
    expect(flow).toMatch(/-webkit-mask-box-image-outset:\s*1px/i);
    expect(flow).toMatch(/-webkit-mask-box-image-repeat:\s*round/i);
  });
});
