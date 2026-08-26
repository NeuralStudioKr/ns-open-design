import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 215 (set28 combo)", () => {
  it("copies set28 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-border-top-left-radius:3px;-webkit-text-orientation:mixed;-webkit-clip-path:inset(0);-webkit-mask-box-image-slice:5;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-top-left-radius:\s*3px/i);
    expect(flow).toMatch(/-webkit-text-orientation:\s*mixed/i);
    expect(flow).toMatch(/-webkit-clip-path:\s*inset\(0\)/i);
    expect(flow).toMatch(/-webkit-mask-box-image-slice:\s*5/i);
  });
});
