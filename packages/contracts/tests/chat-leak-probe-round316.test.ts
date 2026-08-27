import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 316 (moz stack binding + box-flex-group)", () => {
  it("copies moz stack binding + box-flex-group", () => {
    const html = [
      '<section class="slide" style="-moz-stack-sizing:stretch-to-fit;-moz-binding:none;-webkit-box-flex-group:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-stack-sizing:\s*stretch-to-fit/i);
    expect(flow).toMatch(/-moz-binding:\s*none/i);
    expect(flow).toMatch(/-webkit-box-flex-group:\s*1/i);
  });
});
