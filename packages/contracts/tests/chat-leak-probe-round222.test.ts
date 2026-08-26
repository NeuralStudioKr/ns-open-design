import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 222 (moz/ms transform)", () => {
  it("copies moz/ms transform and origin", () => {
    const html = [
      '<section class="slide" style="-moz-transform:scale(1);-ms-transform:rotate(0deg);-moz-transform-origin:left top;-ms-transform-origin:50% 50%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-transform:\s*scale\(1\)/i);
    expect(flow).toMatch(/-ms-transform:\s*rotate\(0deg\)/i);
    expect(flow).toMatch(/-moz-transform-origin:\s*left top/i);
    expect(flow).toMatch(/-ms-transform-origin:\s*50%\s*50%/i);
  });
});
