import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 229 (moz-background)", () => {
  it("copies moz-background", () => {
    const html = [
      '<section class="slide" style="-moz-background-clip:padding;-moz-background-origin:border;-moz-background-size:cover;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-background-clip:\s*padding/i);
    expect(flow).toMatch(/-moz-background-origin:\s*border/i);
    expect(flow).toMatch(/-moz-background-size:\s*cover/i);
  });
});
