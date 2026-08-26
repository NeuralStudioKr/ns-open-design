import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 221 (word-wrap + o-text-overflow + moz-tab)", () => {
  it("copies word-wrap o-text-overflow moz-tab-size", () => {
    const html = [
      '<section class="slide" style="word-wrap:break-word;-o-text-overflow:ellipsis;-moz-tab-size:4;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/word-wrap:\s*break-word/i);
    expect(flow).toMatch(/-o-text-overflow:\s*ellipsis/i);
    expect(flow).toMatch(/-moz-tab-size:\s*4/i);
  });
});
