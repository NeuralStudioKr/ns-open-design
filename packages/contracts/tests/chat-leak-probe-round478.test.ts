import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 478 (mixed calc on flow)", () => {
  it("copies calc(0.5rem + 4px) onto flow", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;padding:calc(0.5rem + 4px)">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/padding:\s*calc\(0\.5rem \+ 4px\)/i);
  });
});
