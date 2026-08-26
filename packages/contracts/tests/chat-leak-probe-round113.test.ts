import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 113 (webkit-box-orient)", () => {
  it("copies -webkit-box-orient/direction with line-clamp", () => {
    const html = [
      '<section class="slide" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-line-clamp:3;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-orient:\s*vertical/i);
    expect(flow).toMatch(/-webkit-box-direction:\s*normal/i);
    expect(flow).toMatch(/-webkit-line-clamp:\s*3/i);
  });
});
