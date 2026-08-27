import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 335 (set52 vendor keep)", () => {
  it("copies set52 vendor keep", () => {
    const html = [
      '<section class="slide" style="-ms-content-zoom-snap-points-y:snapList(10%);-webkit-mask-composite-source:source-in;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-content-zoom-snap-points-y:\s*snapList\(10%\)/i);
    expect(flow).toMatch(/-webkit-mask-composite-source:\s*source-in/i);
  });
});
