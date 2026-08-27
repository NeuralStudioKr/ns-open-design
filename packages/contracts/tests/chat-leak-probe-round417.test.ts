import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 417 (dot rem on flow)", () => {
  it("copies host padding:.75rem onto flow", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;padding:.75rem">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/padding:\s*\.75rem/i);
  });
});
