import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 186 (webkit-flex wrap/grow/shrink/basis)", () => {
  it("copies webkit-flex wrap/grow/shrink/basis", () => {
    const html = [
      '<section class="slide" style="-webkit-flex-wrap:wrap;-webkit-flex-flow:row wrap;-webkit-flex-grow:1;-webkit-flex-shrink:0;-webkit-flex-basis:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-flex-wrap:\s*wrap/i);
    expect(flow).toMatch(/-webkit-flex-flow:\s*row wrap/i);
    expect(flow).toMatch(/-webkit-flex-grow:\s*1/i);
    expect(flow).toMatch(/-webkit-flex-shrink:\s*0/i);
    expect(flow).toMatch(/-webkit-flex-basis:\s*auto/i);
  });
});
