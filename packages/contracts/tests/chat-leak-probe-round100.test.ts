import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 100 (page/marks/shape-inside/calc-size)", () => {
  it("copies print and sizing leftovers", () => {
    const html = [
      '<section class="slide" style="page:chapter;marks:crop;shape-inside:display;calc-size:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/page:\s*chapter/i);
    expect(flow).toMatch(/marks:\s*crop/i);
    expect(flow).toMatch(/shape-inside:\s*display/i);
    expect(flow).toMatch(/calc-size:\s*auto/i);
  });
});
