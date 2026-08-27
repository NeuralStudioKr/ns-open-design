import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 305 (set46 combo)", () => {
  it("copies set46 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-attachment:fixed;-webkit-ruby-align:center;-moz-text-orientation:sideways;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-attachment:\s*fixed/i);
    expect(flow).toMatch(/-webkit-ruby-align:\s*center/i);
    expect(flow).toMatch(/-moz-text-orientation:\s*sideways/i);
  });
});
