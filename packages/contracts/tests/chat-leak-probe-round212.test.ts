import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 212 (text-orientation + epub)", () => {
  it("copies webkit/epub writing orientation", () => {
    const html = [
      '<section class="slide" style="-webkit-text-orientation:upright;-epub-text-orientation:sideways;-epub-writing-mode:vertical-rl;-epub-text-combine:horizontal;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-orientation:\s*upright/i);
    expect(flow).toMatch(/-epub-text-orientation:\s*sideways/i);
    expect(flow).toMatch(/-epub-writing-mode:\s*vertical-rl/i);
    expect(flow).toMatch(/-epub-text-combine:\s*horizontal/i);
  });
});
