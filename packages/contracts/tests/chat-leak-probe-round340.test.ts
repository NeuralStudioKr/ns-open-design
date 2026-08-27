import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 340 (set53 combo)", () => {
  it("copies set53 combo", () => {
    const html = [
      '<section class="slide" style="-moz-binding:none;-moz-text-emphasis-style:filled;-ms-content-zoom-snap-points-x:snapList(0%);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-binding:\s*none/i);
    expect(flow).toMatch(/-moz-text-emphasis-style:\s*filled/i);
    expect(flow).toMatch(/-ms-content-zoom-snap-points-x:\s*snapList\(0%\)/i);
  });
});
