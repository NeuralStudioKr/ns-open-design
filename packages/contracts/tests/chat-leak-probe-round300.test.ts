import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 300 (set45 combo)", () => {
  it("copies set45 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-shape-margin:0;-webkit-wrap-flow:auto;-webkit-flow-into:main;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-shape-margin:\s*0/i);
    expect(flow).toMatch(/-webkit-wrap-flow:\s*auto/i);
    expect(flow).toMatch(/-webkit-flow-into:\s*main/i);
  });
});
