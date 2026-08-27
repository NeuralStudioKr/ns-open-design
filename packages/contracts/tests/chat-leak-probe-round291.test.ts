import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 291 (ime-mode zoom-chaining)", () => {
  it("copies ime-mode zoom-chaining", () => {
    const html = [
      '<section class="slide" style="-ms-ime-mode:active;ime-mode:disabled;-ms-content-zoom-chaining:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-ime-mode:\s*active/i);
    expect(flow).toMatch(/ime-mode:\s*disabled/i);
    expect(flow).toMatch(/-ms-content-zoom-chaining:\s*none/i);
  });
});
