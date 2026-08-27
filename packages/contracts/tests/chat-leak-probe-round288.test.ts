import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 288 (ruby-align aspect-ratio)", () => {
  it("copies ruby-align aspect-ratio", () => {
    const html = [
      '<section class="slide" style="-webkit-ruby-align:start;-webkit-aspect-ratio:16/9;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-ruby-align:\s*start/i);
    expect(flow).toMatch(/-webkit-aspect-ratio:\s*16\/9/i);
  });
});
