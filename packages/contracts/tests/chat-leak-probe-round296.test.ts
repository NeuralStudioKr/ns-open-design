import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 296 (webkit shape)", () => {
  it("copies webkit shape", () => {
    const html = [
      '<section class="slide" style="-webkit-shape-outside:circle(50%);-webkit-shape-inside:display;-webkit-shape-margin:1px;-webkit-shape-padding:2px;-webkit-shape-image-threshold:0.5;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-shape-outside:\s*circle\(50%\)/i);
    expect(flow).toMatch(/-webkit-shape-inside:\s*display/i);
    expect(flow).toMatch(/-webkit-shape-margin:\s*1px/i);
    expect(flow).toMatch(/-webkit-shape-padding:\s*2px/i);
    expect(flow).toMatch(/-webkit-shape-image-threshold:\s*0\.5/i);
  });
});
