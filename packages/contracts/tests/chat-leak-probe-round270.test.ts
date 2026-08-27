import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 270 (set39 combo)", () => {
  it("copies set39 combo", () => {
    const html = [
      '<section class="slide" style="-moz-border-image-slice:5;-ms-writing-mode:lr-tb;text-zoom:reset;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-border-image-slice:\s*5/i);
    expect(flow).toMatch(/-ms-writing-mode:\s*lr-tb/i);
    expect(flow).toMatch(/text-zoom:\s*reset/i);
  });
});
