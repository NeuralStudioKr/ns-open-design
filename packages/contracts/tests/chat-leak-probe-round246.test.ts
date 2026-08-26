import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 246 (moz-transition)", () => {
  it("copies moz-transition", () => {
    const html = [
      '<section class="slide" style="-moz-transition:opacity .2s;-moz-transition-property:opacity;-moz-transition-duration:.2s;-moz-transition-delay:.05s;-moz-transition-timing-function:ease-out;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-transition:\s*opacity .2s/i);
    expect(flow).toMatch(/-moz-transition-property:\s*opacity/i);
    expect(flow).toMatch(/-moz-transition-duration:\s*\.2s/i);
    expect(flow).toMatch(/-moz-transition-delay:\s*\.05s/i);
    expect(flow).toMatch(/-moz-transition-timing-function:\s*ease-out/i);
  });
});
