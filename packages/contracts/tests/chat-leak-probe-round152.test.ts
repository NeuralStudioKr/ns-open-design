import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 152 (webkit-box-ordinal/lines)", () => {
  it("copies -webkit-box-ordinal-group and box-lines", () => {
    const html = [
      '<section class="slide" style="-webkit-box-ordinal-group:2;-webkit-box-lines:multiple;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-ordinal-group:\s*2/i);
    expect(flow).toMatch(/-webkit-box-lines:\s*multiple/i);
  });
});
