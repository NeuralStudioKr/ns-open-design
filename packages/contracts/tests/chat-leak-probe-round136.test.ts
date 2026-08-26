import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 136 (webkit-animation core)", () => {
  it("copies -webkit-animation shorthand and name/duration/delay", () => {
    const html = [
      '<section class="slide" style="-webkit-animation:spin 1s linear infinite;-webkit-animation-name:spin;-webkit-animation-duration:1s;-webkit-animation-delay:.1s;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation:\s*spin 1s linear infinite/i);
    expect(flow).toMatch(/-webkit-animation-name:\s*spin/i);
    expect(flow).toMatch(/-webkit-animation-duration:\s*1s/i);
    expect(flow).toMatch(/-webkit-animation-delay:\s*\.1s/i);
  });
});
