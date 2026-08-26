import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 209 (invent-frame keep + vendor stack)", () => {
  it("copies invent-frame keep + vendor stack", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-delay:0s;-webkit-text-emphasis:none;-webkit-box-sizing:border-box;box-shadow:0 0 0 1px red;border-top:1px solid teal;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-delay:\s*0s/i);
    expect(flow).toMatch(/-webkit-text-emphasis:\s*none/i);
    expect(flow).toMatch(/-webkit-box-sizing:\s*border-box/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(flow).not.toMatch(/border-top/i);
  });
});
