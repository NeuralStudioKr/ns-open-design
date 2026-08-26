import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 112 (webkit-background-clip)", () => {
  it("copies -webkit-background-clip", () => {
    const html = [
      '<section class="slide" style="-webkit-background-clip:text;background-clip:text;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-background-clip:\s*text/i);
    expect(flow).toMatch(/background-clip:\s*text/i);
  });
});
