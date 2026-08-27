import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 272 (webkit border logical longhands)", () => {
  it("copies webkit border logical longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-border-before-color:navy;-webkit-border-before-style:solid;-webkit-border-before-width:1px;-webkit-border-after-color:teal;-webkit-border-start-width:2px;-webkit-border-end-style:dashed;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-before-color:\s*navy/i);
    expect(flow).toMatch(/-webkit-border-before-style:\s*solid/i);
    expect(flow).toMatch(/-webkit-border-before-width:\s*1px/i);
    expect(flow).toMatch(/-webkit-border-after-color:\s*teal/i);
    expect(flow).toMatch(/-webkit-border-start-width:\s*2px/i);
    expect(flow).toMatch(/-webkit-border-end-style:\s*dashed/i);
  });
});
