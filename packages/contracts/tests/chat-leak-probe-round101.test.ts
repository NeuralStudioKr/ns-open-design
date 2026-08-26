import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 101 (SVG paint/geometry style)", () => {
  it("copies fill/stroke opacity and circle geometry props", () => {
    const html = [
      '<section class="slide" style="fill:red;stroke:blue;stroke-width:2px;fill-opacity:0.8;stroke-opacity:0.5;cx:10px;cy:20px;r:5px;rx:4px;ry:3px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/fill:\s*red/i);
    expect(flow).toMatch(/stroke:\s*blue/i);
    expect(flow).toMatch(/stroke-width:\s*2px/i);
    expect(flow).toMatch(/fill-opacity:\s*0\.8/i);
    expect(flow).toMatch(/stroke-opacity:\s*0\.5/i);
    expect(flow).toMatch(/cx:\s*10px/i);
    expect(flow).toMatch(/cy:\s*20px/i);
    expect(flow).toMatch(/r:\s*5px/i);
    expect(flow).toMatch(/rx:\s*4px/i);
    expect(flow).toMatch(/ry:\s*3px/i);
  });
});
