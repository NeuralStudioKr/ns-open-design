import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 216 (word-break + decorations + line-box)", () => {
  it("copies webkit word-break decorations line-box", () => {
    const html = [
      '<section class="slide" style="-webkit-word-break:break-all;-webkit-text-decorations-in-effect:underline;-webkit-line-box-contain:block;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-word-break:\s*break-all/i);
    expect(flow).toMatch(/-webkit-text-decorations-in-effect:\s*underline/i);
    expect(flow).toMatch(/-webkit-line-box-contain:\s*block/i);
  });
});
