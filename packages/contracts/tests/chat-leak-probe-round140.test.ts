import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 140 (animation+hyphens combo)", () => {
  it("copies webkit animation and hyphens together", () => {
    const html = [
      '<section class="slide" style="-webkit-animation-name:fade;-webkit-animation-duration:.5s;-webkit-hyphens:manual;-webkit-column-span:all;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation-name:\s*fade/i);
    expect(flow).toMatch(/-webkit-animation-duration:\s*\.5s/i);
    expect(flow).toMatch(/-webkit-hyphens:\s*manual/i);
    expect(flow).toMatch(/-webkit-column-span:\s*all/i);
  });
});
