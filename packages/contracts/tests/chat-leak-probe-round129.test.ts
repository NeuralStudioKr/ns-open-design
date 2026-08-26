import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 129 (webkit-columns)", () => {
  it("copies -webkit-columns props", () => {
    const html = [
      '<section class="slide" style="-webkit-columns:3;-webkit-column-count:3;-webkit-column-gap:24px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-columns:\s*3/i);
    expect(flow).toMatch(/-webkit-column-count:\s*3/i);
    expect(flow).toMatch(/-webkit-column-gap:\s*24px/i);
  });
});
