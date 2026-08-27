import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 257 (moz border colors)", () => {
  it("copies moz border colors", () => {
    const html = [
      '<section class="slide" style="-moz-border-top-colors:red;-moz-border-right-colors:blue;-moz-border-bottom-colors:green;-moz-border-left-colors:navy;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-border-top-colors:\s*red/i);
    expect(flow).toMatch(/-moz-border-right-colors:\s*blue/i);
    expect(flow).toMatch(/-moz-border-bottom-colors:\s*green/i);
    expect(flow).toMatch(/-moz-border-left-colors:\s*navy/i);
  });
});
