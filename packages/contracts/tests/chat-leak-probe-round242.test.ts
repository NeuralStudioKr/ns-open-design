import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 242 (moz-box legacy)", () => {
  it("copies moz-box legacy", () => {
    const html = [
      '<section class="slide" style="-moz-box-align:center;-moz-box-direction:reverse;-moz-box-flex:1;-moz-box-ordinal-group:2;-moz-box-orient:vertical;-moz-box-pack:justify;-moz-box-sizing:border-box;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-box-align:\s*center/i);
    expect(flow).toMatch(/-moz-box-direction:\s*reverse/i);
    expect(flow).toMatch(/-moz-box-flex:\s*1/i);
    expect(flow).toMatch(/-moz-box-ordinal-group:\s*2/i);
    expect(flow).toMatch(/-moz-box-orient:\s*vertical/i);
    expect(flow).toMatch(/-moz-box-pack:\s*justify/i);
    expect(flow).toMatch(/-moz-box-sizing:\s*border-box/i);
  });
});
