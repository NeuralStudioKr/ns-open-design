import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 92 (font-synthesis longhands)", () => {
  it("copies font-synthesis-* longhands onto flow", () => {
    const html = [
      '<section class="slide" style="font-synthesis-weight:none;font-synthesis-style:none;font-synthesis-small-caps:none;font-synthesis-position:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/font-synthesis-weight:\s*none/i);
    expect(flow).toMatch(/font-synthesis-style:\s*none/i);
    expect(flow).toMatch(/font-synthesis-small-caps:\s*none/i);
    expect(flow).toMatch(/font-synthesis-position:\s*none/i);
  });
});
