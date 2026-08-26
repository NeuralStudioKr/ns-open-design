import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 154 (webkit logical sizes)", () => {
  it("copies -webkit-logical width/height and min/max", () => {
    const html = [
      '<section class="slide" style="-webkit-logical-width:80%;-webkit-logical-height:50%;-webkit-min-logical-width:10px;-webkit-min-logical-height:20px;-webkit-max-logical-width:90%;-webkit-max-logical-height:70%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-logical-width:\s*80%/i);
    expect(flow).toMatch(/-webkit-logical-height:\s*50%/i);
    expect(flow).toMatch(/-webkit-min-logical-width:\s*10px/i);
    expect(flow).toMatch(/-webkit-min-logical-height:\s*20px/i);
    expect(flow).toMatch(/-webkit-max-logical-width:\s*90%/i);
    expect(flow).toMatch(/-webkit-max-logical-height:\s*70%/i);
  });
});
