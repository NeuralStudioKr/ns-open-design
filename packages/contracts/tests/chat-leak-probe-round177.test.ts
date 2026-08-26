import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 177 (webkit-border logical)", () => {
  it("copies webkit-border logical", () => {
    const html = [
      '<section class="slide" style="-webkit-border-before:1px solid navy;-webkit-border-after:1px solid teal;-webkit-border-start:2px solid olive;-webkit-border-end:2px solid maroon;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-before:\s*1px solid navy/i);
    expect(flow).toMatch(/-webkit-border-after:\s*1px solid teal/i);
    expect(flow).toMatch(/-webkit-border-start:\s*2px solid olive/i);
    expect(flow).toMatch(/-webkit-border-end:\s*2px solid maroon/i);
  });
});
