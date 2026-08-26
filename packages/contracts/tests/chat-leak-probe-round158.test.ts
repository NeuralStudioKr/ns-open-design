import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 158 (webkit-marquee)", () => {
  it("copies -webkit-marquee and style/direction", () => {
    const html = [
      '<section class="slide" style="-webkit-marquee:auto;-webkit-marquee-style:scroll;-webkit-marquee-direction:forwards;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-marquee:\s*auto/i);
    expect(flow).toMatch(/-webkit-marquee-style:\s*scroll/i);
    expect(flow).toMatch(/-webkit-marquee-direction:\s*forwards/i);
  });
});
