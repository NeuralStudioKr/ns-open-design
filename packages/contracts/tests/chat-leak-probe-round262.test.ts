import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 262 (column-rule longhands)", () => {
  it("copies column-rule longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-column-rule-color:navy;-webkit-column-rule-style:solid;-webkit-column-rule-width:2px;-moz-column-rule-color:teal;-moz-column-rule-style:dashed;-moz-column-rule-width:1px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-column-rule-color:\s*navy/i);
    expect(flow).toMatch(/-webkit-column-rule-style:\s*solid/i);
    expect(flow).toMatch(/-webkit-column-rule-width:\s*2px/i);
    expect(flow).toMatch(/-moz-column-rule-color:\s*teal/i);
    expect(flow).toMatch(/-moz-column-rule-style:\s*dashed/i);
    expect(flow).toMatch(/-moz-column-rule-width:\s*1px/i);
  });
});
