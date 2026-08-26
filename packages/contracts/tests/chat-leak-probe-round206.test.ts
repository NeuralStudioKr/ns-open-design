import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 206 (transition+emphasis regression)", () => {
  it("copies transition-delay with text-emphasis", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-delay:.05s;-webkit-text-emphasis-position:over right;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-delay:\s*\.05s/i);
    expect(flow).toMatch(/-webkit-text-emphasis-position:\s*over right/i);
  });
});
