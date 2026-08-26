import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 190 (set23 flex combo)", () => {
  it("copies set23 flex combo", () => {
    const html = [
      '<section class="slide" style="-webkit-flex-wrap:nowrap;-webkit-order:1;-webkit-column-axis:vertical;-webkit-align-self:center;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-flex-wrap:\s*nowrap/i);
    expect(flow).toMatch(/-webkit-order:\s*1/i);
    expect(flow).toMatch(/-webkit-column-axis:\s*vertical/i);
    expect(flow).toMatch(/-webkit-align-self:\s*center/i);
  });
});
