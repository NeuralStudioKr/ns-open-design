import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 117 (fill+path combo)", () => {
  it("copies fill/stroke with path geometry", () => {
    const html = [
      '<section class="slide" style="fill:red;stroke:blue;stroke-width:1px;d:path(\'M0 0\');x:3px;y:4px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/fill:\s*red/i);
    expect(flow).toMatch(/stroke:\s*blue/i);
    expect(flow).toMatch(/stroke-width:\s*1px/i);
    expect(flow).toMatch(/d:\s*path\('M0 0'\)/i);
    expect(flow).toMatch(/x:\s*3px/i);
    expect(flow).toMatch(/y:\s*4px/i);
  });
});
