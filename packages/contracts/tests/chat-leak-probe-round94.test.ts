import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 94 (initial-letter / math-shift / hyphenate-lines)", () => {
  it("copies initial-letter-align/wrap, math-shift, hyphenate-limit-lines", () => {
    const html = [
      '<section class="slide" style="initial-letter-align:border;initial-letter-wrap:all;math-shift:compact;hyphenate-limit-lines:2;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/initial-letter-align:\s*border/i);
    expect(flow).toMatch(/initial-letter-wrap:\s*all/i);
    expect(flow).toMatch(/math-shift:\s*compact/i);
    expect(flow).toMatch(/hyphenate-limit-lines:\s*2/i);
  });
});
