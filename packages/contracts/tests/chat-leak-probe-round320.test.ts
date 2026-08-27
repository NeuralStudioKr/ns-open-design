import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 320 (set49 combo)", () => {
  it("copies set49 combo", () => {
    const html = [
      '<section class="slide" style="-moz-stack-sizing:preserve-content;-webkit-box-flex-group:2;-moz-text-emphasis:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-stack-sizing:\s*preserve-content/i);
    expect(flow).toMatch(/-webkit-box-flex-group:\s*2/i);
    expect(flow).toMatch(/-moz-text-emphasis:\s*none/i);
  });
});
