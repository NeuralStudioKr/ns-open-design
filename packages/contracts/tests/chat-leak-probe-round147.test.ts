import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 147 (column-rule/fill regression)", () => {
  it("copies -webkit-column-rule and fill", () => {
    const html = [
      '<section class="slide" style="-webkit-column-rule:2px dotted teal;-webkit-column-fill:auto;-webkit-hyphens:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-column-rule:\s*2px dotted teal/i);
    expect(flow).toMatch(/-webkit-column-fill:\s*auto/i);
    expect(flow).toMatch(/-webkit-hyphens:\s*none/i);
  });
});
