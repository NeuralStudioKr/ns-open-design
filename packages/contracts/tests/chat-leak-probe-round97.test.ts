import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 97 (line-clamp / color-adjust)", () => {
  it("copies -webkit-line-clamp and color-adjust", () => {
    const html = [
      '<section class="slide" style="-webkit-line-clamp:3;color-adjust:exact;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-line-clamp:\s*3/i);
    expect(flow).toMatch(/color-adjust:\s*exact/i);
  });
});
