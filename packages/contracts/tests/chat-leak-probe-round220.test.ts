import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 220 (set29 combo)", () => {
  it("copies set29 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-word-break:keep-all;-webkit-hyphenate-limit-zone:5%;-moz-appearance:button;-ms-user-select:text;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-word-break:\s*keep-all/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-zone:\s*5%/i);
    expect(flow).toMatch(/-moz-appearance:\s*button/i);
    expect(flow).toMatch(/-ms-user-select:\s*text/i);
  });
});
