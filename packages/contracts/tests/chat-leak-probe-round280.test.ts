import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 280 (set41 combo)", () => {
  it("copies set41 combo", () => {
    const html = [
      '<section class="slide" style="-ms-content-zoom-limit-max:3;-ms-scroll-limit-y-max:200px;-epub-word-break:keep-all;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-content-zoom-limit-max:\s*3/i);
    expect(flow).toMatch(/-ms-scroll-limit-y-max:\s*200px/i);
    expect(flow).toMatch(/-epub-word-break:\s*keep-all/i);
  });
});
