import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 297 (webkit wrap)", () => {
  it("copies webkit wrap", () => {
    const html = [
      '<section class="slide" style="-webkit-wrap-flow:end;-webkit-wrap-margin:1rem;-webkit-wrap-padding:2px;-webkit-wrap-through:none;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-wrap-flow:\s*end/i);
    expect(flow).toMatch(/-webkit-wrap-margin:\s*1rem/i);
    expect(flow).toMatch(/-webkit-wrap-padding:\s*2px/i);
    expect(flow).toMatch(/-webkit-wrap-through:\s*none/i);
  });
});
