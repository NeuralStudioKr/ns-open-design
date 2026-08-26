import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 90 (border-image + counter combo)", () => {
  it("copies combined border-image and counter props", () => {
    const html = [
      '<section class="slide" style="border-image-source:url(a.png);border-image-slice:10 fill;counter-reset:item 0;counter-increment:item 2;contain-intrinsic-size:auto 120px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/border-image-source:\s*url\(a\.png\)/i);
    expect(flow).toMatch(/border-image-slice:\s*10 fill/i);
    expect(flow).toMatch(/counter-reset:\s*item 0/i);
    expect(flow).toMatch(/counter-increment:\s*item 2/i);
    expect(flow).toMatch(/contain-intrinsic-size:\s*auto 120px/i);
  });
});
