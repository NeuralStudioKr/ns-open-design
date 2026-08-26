import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 109 (SVG path geometry)", () => {
  it("copies x/y/d/points/pathLength onto flow", () => {
    const html = [
      '<section class="slide" style="x:1px;y:2px;d:path(\'M0 0\');points:0 0 1 1;pathLength:100;path-length:100;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/x:\s*1px/i);
    expect(flow).toMatch(/y:\s*2px/i);
    expect(flow).toMatch(/d:\s*path\('M0 0'\)/i);
    expect(flow).toMatch(/points:\s*0 0 1 1/i);
    expect(flow).toMatch(/pathLength:\s*100/i);
    expect(flow).toMatch(/path-length:\s*100/i);
  });
});
