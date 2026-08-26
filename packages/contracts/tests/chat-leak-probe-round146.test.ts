import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 146 (animation play-state regression)", () => {
  it("copies -webkit-animation-play-state with fill-mode", () => {
    const html = [
      '<section class="slide" style="-webkit-animation-play-state:running;-webkit-animation-fill-mode:forwards;-webkit-animation-direction:reverse;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation-play-state:\s*running/i);
    expect(flow).toMatch(/-webkit-animation-fill-mode:\s*forwards/i);
    expect(flow).toMatch(/-webkit-animation-direction:\s*reverse/i);
  });
});
