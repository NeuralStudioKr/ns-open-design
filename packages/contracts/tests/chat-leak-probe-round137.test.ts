import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 137 (webkit-animation longhands)", () => {
  it("copies remaining -webkit-animation longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-animation-timing-function:ease;-webkit-animation-iteration-count:2;-webkit-animation-direction:alternate;-webkit-animation-fill-mode:both;-webkit-animation-play-state:paused;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation-timing-function:\s*ease/i);
    expect(flow).toMatch(/-webkit-animation-iteration-count:\s*2/i);
    expect(flow).toMatch(/-webkit-animation-direction:\s*alternate/i);
    expect(flow).toMatch(/-webkit-animation-fill-mode:\s*both/i);
    expect(flow).toMatch(/-webkit-animation-play-state:\s*paused/i);
  });
});
