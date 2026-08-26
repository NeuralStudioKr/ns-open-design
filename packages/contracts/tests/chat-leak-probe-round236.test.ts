import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 236 (ms-touch-action + text-overflow + interp)", () => {
  it("copies ms-touch-action + text-overflow + interp", () => {
    const html = [
      '<section class="slide" style="-ms-touch-action:manipulation;-ms-text-overflow:ellipsis;-ms-interpolation-mode:nearest-neighbor;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-touch-action:\s*manipulation/i);
    expect(flow).toMatch(/-ms-text-overflow:\s*ellipsis/i);
    expect(flow).toMatch(/-ms-interpolation-mode:\s*nearest-neighbor/i);
  });
});
