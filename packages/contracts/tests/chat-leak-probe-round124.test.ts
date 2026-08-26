import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 124 (webkit transform/transition)", () => {
  it("copies -webkit-transform and -webkit-transition props", () => {
    const html = [
      '<section class="slide" style="-webkit-transform:scale(1.1);-webkit-transition:opacity .2s;-webkit-transition-property:opacity;-webkit-transition-duration:.2s;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transform:\s*scale\(1\.1\)/i);
    expect(flow).toMatch(/-webkit-transition:\s*opacity \.2s/i);
    expect(flow).toMatch(/-webkit-transition-property:\s*opacity/i);
    expect(flow).toMatch(/-webkit-transition-duration:\s*\.2s/i);
  });
});
