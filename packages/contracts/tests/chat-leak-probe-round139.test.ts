import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 139 (text-security / user-drag)", () => {
  it("copies -webkit-text-security and user-drag props", () => {
    const html = [
      "<section class=\"slide\" style=\"-webkit-text-security:disc;-webkit-user-drag:element;user-drag:none;-webkit-box-reflect:below;-webkit-locale:'ko';-webkit-ruby-position:inter-character;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-security:\s*disc/i);
    expect(flow).toMatch(/-webkit-user-drag:\s*element/i);
    expect(flow).toMatch(/user-drag:\s*none/i);
    expect(flow).toMatch(/-webkit-box-reflect:\s*below/i);
    expect(flow).toMatch(/-webkit-locale:\s*'ko'/i);
    expect(flow).toMatch(/-webkit-ruby-position:\s*inter-character/i);
  });
});
