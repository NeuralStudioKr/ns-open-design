import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 77 (counter · contain-intrinsic)", () => {
  it("copies counter and contain-intrinsic into slide flow", () => {
    const html = [
      '<section class="slide" style="counter-reset:sec;counter-increment:sec;counter-set:sec 1;contain-intrinsic-width:auto 100px;contain-intrinsic-height:200px;contain-intrinsic-block-size:auto 50px;contain-intrinsic-inline-size:100px;content:\'x\';quotes:\'«\' \'»\';width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/counter-reset:\s*sec/i);
    expect(flow).toMatch(/counter-increment:\s*sec/i);
    expect(flow).toMatch(/counter-set:\s*sec 1/i);
    expect(flow).toMatch(/contain-intrinsic-width:\s*auto 100px/i);
    expect(flow).toMatch(/contain-intrinsic-height:\s*200px/i);
    expect(flow).toMatch(/contain-intrinsic-block-size:\s*auto 50px/i);
    expect(flow).toMatch(/contain-intrinsic-inline-size:\s*100px/i);
    expect(flow).toMatch(/content:\s*'x'/i);
    expect(flow).toMatch(/quotes:/i);
  });
});
