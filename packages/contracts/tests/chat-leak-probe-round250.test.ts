import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 250 (set35 combo)", () => {
  it("copies set35 combo", () => {
    const html = [
      '<section class="slide" style="-moz-transition-delay:.1s;-moz-animation-name:fade;-moz-perspective:500px;-moz-opacity:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-transition-delay:\s*\.1s/i);
    expect(flow).toMatch(/-moz-animation-name:\s*fade/i);
    expect(flow).toMatch(/-moz-perspective:\s*500px/i);
    expect(flow).toMatch(/-moz-opacity:\s*1/i);
  });
});
