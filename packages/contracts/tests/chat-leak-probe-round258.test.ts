import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 258 (moz text-blink force-broken)", () => {
  it("copies moz text-blink force-broken", () => {
    const html = [
      '<section class="slide" style="-moz-text-blink:none;-moz-force-broken-image-icon:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-text-blink:\s*none/i);
    expect(flow).toMatch(/-moz-force-broken-image-icon:\s*1/i);
  });
});
