import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 181 (webkit perspective/transform origin)", () => {
  it("copies webkit perspective/transform origin", () => {
    const html = [
      '<section class="slide" style="-webkit-perspective-origin:50% 50%;-webkit-transform-origin:center;-webkit-transform-style:preserve-3d;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-perspective-origin:\s*50% 50%/i);
    expect(flow).toMatch(/-webkit-transform-origin:\s*center/i);
    expect(flow).toMatch(/-webkit-transform-style:\s*preserve-3d/i);
  });
});
