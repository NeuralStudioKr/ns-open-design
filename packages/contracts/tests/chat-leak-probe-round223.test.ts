import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 223 (moz-backface + ms-overflow-style)", () => {
  it("copies moz-backface and ms-overflow-style", () => {
    const html = [
      '<section class="slide" style="-moz-backface-visibility:hidden;-ms-overflow-style:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-backface-visibility:\s*hidden/i);
    expect(flow).toMatch(/-ms-overflow-style:\s*none/i);
  });
});
