import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 197 (webkit-transition delay/timing)", () => {
  it("copies webkit-transition delay/timing", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-delay:.2s;-webkit-transition-timing-function:ease-out;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-delay:\s*\.2s/i);
    expect(flow).toMatch(/-webkit-transition-timing-function:\s*ease-out/i);
  });
});
