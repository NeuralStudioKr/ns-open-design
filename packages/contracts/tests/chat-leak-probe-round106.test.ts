import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 106 (font-smooth)", () => {
  it("copies font-smooth vendor props", () => {
    const html = [
      '<section class="slide" style="font-smooth:always;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/font-smooth:\s*always/i);
    expect(flow).toMatch(/-webkit-font-smoothing:\s*antialiased/i);
    expect(flow).toMatch(/-moz-osx-font-smoothing:\s*grayscale/i);
  });
});
