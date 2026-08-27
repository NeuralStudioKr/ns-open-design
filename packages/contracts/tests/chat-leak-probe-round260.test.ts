import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 260 (set37 combo)", () => {
  it("copies set37 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-repeat-x:repeat;-moz-border-top-colors:tomato;-moz-text-blink:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-repeat-x:\s*repeat/i);
    expect(flow).toMatch(/-moz-border-top-colors:\s*tomato/i);
    expect(flow).toMatch(/-moz-text-blink:\s*none/i);
  });
});
