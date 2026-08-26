import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 110 (app-region)", () => {
  it("copies app-region vendor props", () => {
    const html = [
      '<section class="slide" style="app-region:drag;-webkit-app-region:no-drag;-webkit-tap-highlight-color:transparent;-webkit-appearance:none;-webkit-user-select:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/app-region:\s*drag/i);
    expect(flow).toMatch(/-webkit-app-region:\s*no-drag/i);
    expect(flow).toMatch(/-webkit-tap-highlight-color:\s*transparent/i);
    expect(flow).toMatch(/-webkit-appearance:\s*none/i);
    expect(flow).toMatch(/-webkit-user-select:\s*none/i);
  });
});
