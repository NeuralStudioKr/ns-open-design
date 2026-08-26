import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 235 (set32 combo)", () => {
  it("copies set32 combo", () => {
    const html = [
      '<section class="slide" style="-moz-column-count:3;-webkit-rtl-ordering:visual;-moz-user-focus:none;-moz-print-color-adjust:economy;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-column-count:\s*3/i);
    expect(flow).toMatch(/-webkit-rtl-ordering:\s*visual/i);
    expect(flow).toMatch(/-moz-user-focus:\s*none/i);
    expect(flow).toMatch(/-moz-print-color-adjust:\s*economy/i);
  });
});
