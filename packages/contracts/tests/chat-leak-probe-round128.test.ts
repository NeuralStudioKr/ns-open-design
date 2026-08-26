import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 128 (webkit-flex)", () => {
  it("copies -webkit-flex layout props", () => {
    const html = [
      '<section class="slide" style="-webkit-flex:1 1 auto;-webkit-flex-direction:row;-webkit-justify-content:center;-webkit-align-items:stretch;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-flex:\s*1 1 auto/i);
    expect(flow).toMatch(/-webkit-flex-direction:\s*row/i);
    expect(flow).toMatch(/-webkit-justify-content:\s*center/i);
    expect(flow).toMatch(/-webkit-align-items:\s*stretch/i);
  });
});
