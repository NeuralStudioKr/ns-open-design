import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 111 (webkit text stroke/fill)", () => {
  it("copies -webkit-text-fill/stroke props", () => {
    const html = [
      '<section class="slide" style="-webkit-text-fill-color:tomato;-webkit-text-stroke:1px navy;-webkit-text-stroke-width:2px;-webkit-text-stroke-color:teal;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-fill-color:\s*tomato/i);
    expect(flow).toMatch(/-webkit-text-stroke:\s*1px navy/i);
    expect(flow).toMatch(/-webkit-text-stroke-width:\s*2px/i);
    expect(flow).toMatch(/-webkit-text-stroke-color:\s*teal/i);
  });
});
