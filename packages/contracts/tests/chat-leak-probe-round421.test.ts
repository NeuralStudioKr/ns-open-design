import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 421 (var padding on flow)", () => {
  it("copies var(--p, 16px) padding onto flow", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;padding:var(--p, 16px)">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/padding:\s*var\(--p,\s*16px\)/i);
  });
});
