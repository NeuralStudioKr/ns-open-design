import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 313 (invent-frame props stay off flow)", () => {
  it("does not copy box-shadow or physical border-top onto flow", () => {
    const html = [
      '<section class="slide" style="background-blend-mode:normal;box-shadow:0 0 0 1px red;-webkit-box-shadow:0 0 0 1px blue;-moz-box-shadow:0 0 0 1px green;border-top:1px solid navy;background-color:snow;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow/i);
    expect(flow).not.toMatch(/border-top/i);
    expect(flow).not.toMatch(/background-color/i);
  });
});
