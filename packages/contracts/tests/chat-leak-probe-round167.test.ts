import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 167 (box-decoration-break / mask-source-type)", () => {
  it("copies box-decoration-break / mask-source-type", () => {
    const html = [
      '<section class="slide" style="-webkit-box-decoration-break:clone;-webkit-mask-source-type:luminance;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-decoration-break:\s*clone/i);
    expect(flow).toMatch(/-webkit-mask-source-type:\s*luminance/i);
  });
});
