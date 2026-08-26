import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 198 (webkit-text-emphasis)", () => {
  it("copies webkit-text-emphasis", () => {
    const html = [
      '<section class="slide" style="-webkit-text-emphasis:filled sesame;-webkit-text-emphasis-color:tomato;-webkit-text-emphasis-position:under left;-webkit-text-emphasis-style:open;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-text-emphasis:\s*filled sesame/i);
    expect(flow).toMatch(/-webkit-text-emphasis-color:\s*tomato/i);
    expect(flow).toMatch(/-webkit-text-emphasis-position:\s*under left/i);
    expect(flow).toMatch(/-webkit-text-emphasis-style:\s*open/i);
  });
});
