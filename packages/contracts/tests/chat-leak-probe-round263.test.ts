import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 263 (font-feature kerning)", () => {
  it("copies font-feature kerning", () => {
    const html = [
      "<section class=\"slide\" style=\"-moz-font-feature-settings:'liga' 1;-ms-font-feature-settings:'kern' 1;-webkit-font-kerning:normal;-moz-font-smoothing:grayscale;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-font-feature-settings:\s*'liga'\s*1/i);
    expect(flow).toMatch(/-ms-font-feature-settings:\s*'kern'\s*1/i);
    expect(flow).toMatch(/-webkit-font-kerning:\s*normal/i);
    expect(flow).toMatch(/-moz-font-smoothing:\s*grayscale/i);
  });
});
