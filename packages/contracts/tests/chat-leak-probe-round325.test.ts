import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 325 (set50 combo)", () => {
  it("copies set50 combo", () => {
    const html = [
      '<section class="slide" style="-moz-binding:url(#x);-ms-content-zoom-snap-points-x:snapInterval(0%,100%);-webkit-mask-composite-source:xor;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-binding:\s*url\(#x\)/i);
    expect(flow).toMatch(/-ms-content-zoom-snap-points-x:\s*snapInterval\(0%,100%\)/i);
    expect(flow).toMatch(/-webkit-mask-composite-source:\s*xor/i);
  });
});
