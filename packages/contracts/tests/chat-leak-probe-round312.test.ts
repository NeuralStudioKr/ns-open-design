import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 312 (wrap padding margin)", () => {
  it("copies wrap padding margin", () => {
    const html = [
      '<section class="slide" style="-webkit-wrap-padding:0;-webkit-wrap-margin:0;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-wrap-padding:\s*0/i);
    expect(flow).toMatch(/-webkit-wrap-margin:\s*0/i);
  });
});
