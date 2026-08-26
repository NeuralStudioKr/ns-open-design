import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 226 (ms-flex shorthand/dir/wrap/flow)", () => {
  it("copies ms-flex shorthand/dir/wrap/flow", () => {
    const html = [
      '<section class="slide" style="-ms-flex:1 1 auto;-ms-flex-direction:column;-ms-flex-wrap:wrap;-ms-flex-flow:row wrap;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-flex:\s*1 1 auto/i);
    expect(flow).toMatch(/-ms-flex-direction:\s*column/i);
    expect(flow).toMatch(/-ms-flex-wrap:\s*wrap/i);
    expect(flow).toMatch(/-ms-flex-flow:\s*row wrap/i);
  });
});
