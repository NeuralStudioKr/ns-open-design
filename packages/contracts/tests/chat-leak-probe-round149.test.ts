import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 149 (set14–15 combo)", () => {
  it("copies reflect, locale, animation, and column props together", () => {
    const html = [
      "<section class=\"slide\" style=\"-webkit-box-reflect:below;-webkit-locale:'ja';-webkit-animation-name:pulse;-webkit-column-span:all;-webkit-user-drag:element;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-reflect:\s*below/i);
    expect(flow).toMatch(/-webkit-locale:\s*'ja'/i);
    expect(flow).toMatch(/-webkit-animation-name:\s*pulse/i);
    expect(flow).toMatch(/-webkit-column-span:\s*all/i);
    expect(flow).toMatch(/-webkit-user-drag:\s*element/i);
  });
});
