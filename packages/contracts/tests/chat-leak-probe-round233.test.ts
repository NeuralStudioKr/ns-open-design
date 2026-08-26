import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 233 (moz-user + print-color)", () => {
  it("copies moz-user + print-color", () => {
    const html = [
      '<section class="slide" style="-moz-user-modify:read-only;-moz-user-focus:ignore;-moz-user-input:disabled;-moz-print-color-adjust:exact;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-user-modify:\s*read-only/i);
    expect(flow).toMatch(/-moz-user-focus:\s*ignore/i);
    expect(flow).toMatch(/-moz-user-input:\s*disabled/i);
    expect(flow).toMatch(/-moz-print-color-adjust:\s*exact/i);
  });
});
