import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 166 (touch-callout/nbsp/line-break)", () => {
  it("copies touch-callout/nbsp/line-break", () => {
    const html = [
      '<section class="slide" style="-webkit-touch-callout:none;-webkit-nbsp-mode:space;-webkit-line-break:after-white-space;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-touch-callout:\s*none/i);
    expect(flow).toMatch(/-webkit-nbsp-mode:\s*space/i);
    expect(flow).toMatch(/-webkit-line-break:\s*after-white-space/i);
  });
});
