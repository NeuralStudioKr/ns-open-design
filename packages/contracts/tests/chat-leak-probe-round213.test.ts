import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 213 (clip-path + image-rendering)", () => {
  it("copies webkit clip-path and image-rendering", () => {
    const html = [
      '<section class="slide" style="-webkit-clip-path:circle(40%);-webkit-image-rendering:pixelated;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-clip-path:\s*circle\(40%\)/i);
    expect(flow).toMatch(/-webkit-image-rendering:\s*pixelated/i);
  });
});
