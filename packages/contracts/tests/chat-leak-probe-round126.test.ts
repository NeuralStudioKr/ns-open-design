import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 126 (print-color / decoration-skip)", () => {
  it("copies -webkit-print-color-adjust and text-decoration-skip", () => {
    const html = [
      '<section class="slide" style="-webkit-print-color-adjust:exact;text-decoration-skip:ink;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-print-color-adjust:\s*exact/i);
    expect(flow).toMatch(/text-decoration-skip:\s*ink/i);
  });
});
