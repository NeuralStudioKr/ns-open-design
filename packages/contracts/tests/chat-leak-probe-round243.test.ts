import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 243 (moz-float-edge orient image-region)", () => {
  it("copies moz-float-edge orient image-region", () => {
    const html = [
      '<section class="slide" style="-moz-float-edge:content-box;-moz-orient:block;-moz-image-region:rect(0px,10px,10px,0px);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-float-edge:\s*content-box/i);
    expect(flow).toMatch(/-moz-orient:\s*block/i);
    expect(flow).toMatch(/-moz-image-region:\s*rect\(0px,10px,10px,0px\)/i);
  });
});
