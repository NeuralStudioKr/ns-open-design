import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 164 (set16–17 combo)", () => {
  it("copies box, border-image, marquee, and logical props together", () => {
    const html = [
      '<section class="slide" style="-webkit-box-align:center;-webkit-border-image-slice:12 fill;-webkit-marquee-style:slide;-webkit-max-logical-width:95%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-align:\s*center/i);
    expect(flow).toMatch(/-webkit-border-image-slice:\s*12 fill/i);
    expect(flow).toMatch(/-webkit-marquee-style:\s*slide/i);
    expect(flow).toMatch(/-webkit-max-logical-width:\s*95%/i);
  });
});
