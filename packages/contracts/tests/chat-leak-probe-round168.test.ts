import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 168 (webkit-background origin/size/composite)", () => {
  it("copies webkit-background origin/size/composite", () => {
    const html = [
      '<section class="slide" style="-webkit-background-origin:border-box;-webkit-background-size:cover;-webkit-background-composite:source-over;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-background-origin:\s*border-box/i);
    expect(flow).toMatch(/-webkit-background-size:\s*cover/i);
    expect(flow).toMatch(/-webkit-background-composite:\s*source-over/i);
  });
});
