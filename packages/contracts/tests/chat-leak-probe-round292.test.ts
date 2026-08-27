import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 292 (view-transition class/group)", () => {
  it("copies view-transition class/group", () => {
    const html = [
      '<section class="slide" style="view-transition-class:card;view-transition-group:hero;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/view-transition-class:\s*card/i);
    expect(flow).toMatch(/view-transition-group:\s*hero/i);
  });
});
