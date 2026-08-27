import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 275 (set40 combo)", () => {
  it("copies set40 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-line-snap:none;-webkit-border-end-width:3px;-webkit-trailing-word:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-line-snap:\s*none/i);
    expect(flow).toMatch(/-webkit-border-end-width:\s*3px/i);
    expect(flow).toMatch(/-webkit-trailing-word:\s*auto/i);
  });
});
