import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 392 (padding lvmin on flow)", () => {
  it("copies host padding:2lvmin onto flow", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;padding:2lvmin">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/padding:\s*2lvmin/i);
  });
});
