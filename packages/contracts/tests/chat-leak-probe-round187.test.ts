import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 187 (webkit-order / align-content/self)", () => {
  it("copies webkit-order / align-content/self", () => {
    const html = [
      '<section class="slide" style="-webkit-order:2;-webkit-align-content:center;-webkit-align-self:stretch;-webkit-justify-items:start;-webkit-justify-self:end;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-order:\s*2/i);
    expect(flow).toMatch(/-webkit-align-content:\s*center/i);
    expect(flow).toMatch(/-webkit-align-self:\s*stretch/i);
    expect(flow).toMatch(/-webkit-justify-items:\s*start/i);
    expect(flow).toMatch(/-webkit-justify-self:\s*end/i);
  });
});
