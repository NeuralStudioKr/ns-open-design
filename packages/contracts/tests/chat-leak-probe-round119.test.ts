import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 119 (set8 vendor combo)", () => {
  it("copies text-stroke, background-clip, and box-orient together", () => {
    const html = [
      '<section class="slide" style="-webkit-text-fill-color:#fff;-webkit-text-stroke-width:1px;-webkit-background-clip:text;-webkit-box-orient:vertical;-webkit-box-direction:reverse;-webkit-line-clamp:2;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-fill-color:\s*#fff/i);
    expect(flow).toMatch(/-webkit-text-stroke-width:\s*1px/i);
    expect(flow).toMatch(/-webkit-background-clip:\s*text/i);
    expect(flow).toMatch(/-webkit-box-orient:\s*vertical/i);
    expect(flow).toMatch(/-webkit-box-direction:\s*reverse/i);
    expect(flow).toMatch(/-webkit-line-clamp:\s*2/i);
  });
});
