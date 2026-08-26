import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 144 (box-reflect / locale regression)", () => {
  it("copies -webkit-box-reflect and locale/ruby", () => {
    const html = [
      "<section class=\"slide\" style=\"-webkit-box-reflect:above;-webkit-locale:'en';-webkit-ruby-position:over;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-reflect:\s*above/i);
    expect(flow).toMatch(/-webkit-locale:\s*'en'/i);
    expect(flow).toMatch(/-webkit-ruby-position:\s*over/i);
  });
});
