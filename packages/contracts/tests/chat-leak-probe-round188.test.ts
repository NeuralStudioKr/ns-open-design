import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 188 (webkit-column-axis/progression)", () => {
  it("copies webkit-column-axis/progression", () => {
    const html = [
      '<section class="slide" style="-webkit-column-axis:horizontal;-webkit-column-progression:normal;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-column-axis:\s*horizontal/i);
    expect(flow).toMatch(/-webkit-column-progression:\s*normal/i);
  });
});
