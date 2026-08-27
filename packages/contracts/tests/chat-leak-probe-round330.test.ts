import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 330 (set51 combo)", () => {
  it("copies set51 combo", () => {
    const html = [
      '<section class="slide" style="-moz-text-emphasis-color:tomato;-webkit-box-flex-group:3;-moz-stack-sizing:stretch-to-fit;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-text-emphasis-color:\s*tomato/i);
    expect(flow).toMatch(/-webkit-box-flex-group:\s*3/i);
    expect(flow).toMatch(/-moz-stack-sizing:\s*stretch-to-fit/i);
  });
});
