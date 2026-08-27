import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 256 (mask position/repeat xy)", () => {
  it("copies mask position/repeat xy", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-position-x:10%;-webkit-mask-position-y:20%;-webkit-mask-repeat-x:repeat;-webkit-mask-repeat-y:no-repeat;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-position-x:\s*10%/i);
    expect(flow).toMatch(/-webkit-mask-position-y:\s*20%/i);
    expect(flow).toMatch(/-webkit-mask-repeat-x:\s*repeat/i);
    expect(flow).toMatch(/-webkit-mask-repeat-y:\s*no-repeat/i);
  });
});
