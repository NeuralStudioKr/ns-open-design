import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 287 (ms-color-scheme + moz-text-orientation)", () => {
  it("copies ms-color-scheme + moz-text-orientation", () => {
    const html = [
      '<section class="slide" style="-ms-color-scheme:dark;-moz-text-orientation:upright;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-color-scheme:\s*dark/i);
    expect(flow).toMatch(/-moz-text-orientation:\s*upright/i);
  });
});
