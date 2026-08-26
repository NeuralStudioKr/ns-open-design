import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 247 (moz-animation)", () => {
  it("copies moz-animation", () => {
    const html = [
      '<section class="slide" style="-moz-animation:spin 1s;-moz-animation-name:spin;-moz-animation-duration:1s;-moz-animation-delay:0s;-moz-animation-timing-function:linear;-moz-animation-iteration-count:infinite;-moz-animation-direction:alternate;-moz-animation-fill-mode:both;-moz-animation-play-state:running;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-animation:\s*spin 1s/i);
    expect(flow).toMatch(/-moz-animation-name:\s*spin/i);
    expect(flow).toMatch(/-moz-animation-duration:\s*1s/i);
    expect(flow).toMatch(/-moz-animation-delay:\s*0s/i);
    expect(flow).toMatch(/-moz-animation-timing-function:\s*linear/i);
    expect(flow).toMatch(/-moz-animation-iteration-count:\s*infinite/i);
    expect(flow).toMatch(/-moz-animation-direction:\s*alternate/i);
    expect(flow).toMatch(/-moz-animation-fill-mode:\s*both/i);
    expect(flow).toMatch(/-moz-animation-play-state:\s*running/i);
  });
});
