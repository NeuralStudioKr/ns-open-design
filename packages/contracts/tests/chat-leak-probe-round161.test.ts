import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 161 (marquee longhands)", () => {
  it("copies -webkit-marquee increment/repetition/speed", () => {
    const html = [
      '<section class="slide" style="-webkit-marquee-increment:6px;-webkit-marquee-repetition:infinite;-webkit-marquee-speed:fast;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-marquee-increment:\s*6px/i);
    expect(flow).toMatch(/-webkit-marquee-repetition:\s*infinite/i);
    expect(flow).toMatch(/-webkit-marquee-speed:\s*fast/i);
  });
});
