import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 237 (ms-scroll + zoom)", () => {
  it("copies ms-scroll + zoom", () => {
    const html = [
      '<section class="slide" style="-ms-scroll-snap-type:mandatory;-ms-scroll-snap-x:proximity;-ms-scroll-snap-y:none;-ms-scroll-chaining:none;-ms-scroll-rails:none;-ms-content-zooming:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-scroll-snap-type:\s*mandatory/i);
    expect(flow).toMatch(/-ms-scroll-snap-x:\s*proximity/i);
    expect(flow).toMatch(/-ms-scroll-snap-y:\s*none/i);
    expect(flow).toMatch(/-ms-scroll-chaining:\s*none/i);
    expect(flow).toMatch(/-ms-scroll-rails:\s*none/i);
    expect(flow).toMatch(/-ms-content-zooming:\s*none/i);
  });
});
