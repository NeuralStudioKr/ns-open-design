import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 290 (set43 combo)", () => {
  it("copies set43 combo", () => {
    const html = [
      '<section class="slide" style="-moz-background-blend-mode:normal;-ms-color-scheme:light;-webkit-aspect-ratio:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-background-blend-mode:\s*normal/i);
    expect(flow).toMatch(/-ms-color-scheme:\s*light/i);
    expect(flow).toMatch(/-webkit-aspect-ratio:\s*auto/i);
  });
});
