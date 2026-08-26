import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 157 (webkit-text-zoom)", () => {
  it("copies -webkit-text-zoom", () => {
    const html = [
      '<section class="slide" style="-webkit-text-zoom:reset;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-zoom:\s*reset/i);
  });
});
