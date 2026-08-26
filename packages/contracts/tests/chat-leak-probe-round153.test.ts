import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 153 (webkit font-feature/variant)", () => {
  it("copies -webkit-font-feature-settings and variant-ligatures", () => {
    const html = [
      '<section class="slide" style="-webkit-font-feature-settings:\'liga\' 1;-webkit-font-variant-ligatures:common-ligatures;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-font-feature-settings:\s*'liga' 1/i);
    expect(flow).toMatch(/-webkit-font-variant-ligatures:\s*common-ligatures/i);
  });
});
