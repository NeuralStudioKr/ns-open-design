import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 281 (moz inert context control)", () => {
  it("copies moz inert context control", () => {
    const html = [
      '<section class="slide" style="-moz-control-character-visibility:visible;-moz-context-properties:fill,stroke;-moz-inert:true;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-control-character-visibility:\s*visible/i);
    expect(flow).toMatch(/-moz-context-properties:\s*fill,stroke/i);
    expect(flow).toMatch(/-moz-inert:\s*true/i);
  });
});
