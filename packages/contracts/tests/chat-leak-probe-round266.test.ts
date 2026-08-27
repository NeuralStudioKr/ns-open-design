import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 266 (moz-border-image)", () => {
  it("copies moz-border-image", () => {
    const html = [
      '<section class="slide" style="-moz-border-image:none;-moz-border-image-source:none;-moz-border-image-slice:10;-moz-border-image-width:2px;-moz-border-image-outset:1px;-moz-border-image-repeat:stretch;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-border-image:\s*none/i);
    expect(flow).toMatch(/-moz-border-image-source:\s*none/i);
    expect(flow).toMatch(/-moz-border-image-slice:\s*10/i);
    expect(flow).toMatch(/-moz-border-image-width:\s*2px/i);
    expect(flow).toMatch(/-moz-border-image-outset:\s*1px/i);
    expect(flow).toMatch(/-moz-border-image-repeat:\s*stretch/i);
  });
});
