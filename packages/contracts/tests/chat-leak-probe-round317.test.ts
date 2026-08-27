import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 317 (mask-composite-source + zoom snap points)", () => {
  it("copies mask-composite-source + zoom snap points", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-composite-source:source-over;-ms-content-zoom-snap-points-x:snapList(100%,200%);-ms-content-zoom-snap-points-y:snapList(0%,50%);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-composite-source:\s*source-over/i);
    expect(flow).toMatch(/-ms-content-zoom-snap-points-x:\s*snapList\(100%,200%\)/i);
    expect(flow).toMatch(/-ms-content-zoom-snap-points-y:\s*snapList\(0%,50%\)/i);
  });
});
