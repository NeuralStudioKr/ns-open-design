import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 183 (webkit-text-combine)", () => {
  it("copies webkit-text-combine", () => {
    const html = [
      '<section class="slide" style="-webkit-text-combine:horizontal;-webkit-text-combine-horizontal:digits 2;-webkit-text-combine-upright:all;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-combine:\s*horizontal/i);
    expect(flow).toMatch(/-webkit-text-combine-horizontal:\s*digits 2/i);
    expect(flow).toMatch(/-webkit-text-combine-upright:\s*all/i);
  });
});
