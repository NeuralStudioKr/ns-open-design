import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 218 (moz/ms appearance select size)", () => {
  it("copies moz/ms appearance user-select text-size-adjust", () => {
    const html = [
      '<section class="slide" style="-moz-appearance:none;-moz-user-select:none;-ms-user-select:none;-moz-text-size-adjust:100%;-ms-text-size-adjust:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-appearance:\s*none/i);
    expect(flow).toMatch(/-moz-user-select:\s*none/i);
    expect(flow).toMatch(/-ms-user-select:\s*none/i);
    expect(flow).toMatch(/-moz-text-size-adjust:\s*100%/i);
    expect(flow).toMatch(/-ms-text-size-adjust:\s*none/i);
  });
});
