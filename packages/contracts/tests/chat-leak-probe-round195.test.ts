import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 195 (set22-24 closure)", () => {
  it("copies set22-24 closure", () => {
    const html = [
      '<section class="slide" style="-webkit-transform-style:flat;-webkit-writing-mode:vertical-lr;-webkit-flex-basis:20%;-webkit-column-progression:reverse;-webkit-justify-self:center;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transform-style:\s*flat/i);
    expect(flow).toMatch(/-webkit-writing-mode:\s*vertical-lr/i);
    expect(flow).toMatch(/-webkit-flex-basis:\s*20%/i);
    expect(flow).toMatch(/-webkit-column-progression:\s*reverse/i);
    expect(flow).toMatch(/-webkit-justify-self:\s*center/i);
  });
});
