import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 156 (webkit-border-image)", () => {
  it("copies -webkit-border-image shorthand and longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-border-image:url(a.png) 10 fill;-webkit-border-image-source:url(b.png);-webkit-border-image-slice:10 fill;-webkit-border-image-width:8px;-webkit-border-image-outset:2px;-webkit-border-image-repeat:round;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-image:\s*url\(a\.png\) 10 fill/i);
    expect(flow).toMatch(/-webkit-border-image-source:\s*url\(b\.png\)/i);
    expect(flow).toMatch(/-webkit-border-image-slice:\s*10 fill/i);
    expect(flow).toMatch(/-webkit-border-image-width:\s*8px/i);
    expect(flow).toMatch(/-webkit-border-image-outset:\s*2px/i);
    expect(flow).toMatch(/-webkit-border-image-repeat:\s*round/i);
  });
});
