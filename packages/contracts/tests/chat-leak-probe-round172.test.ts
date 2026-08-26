import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 172 (webkit-hyphenate)", () => {
  it("copies -webkit-hyphenate character and limits", () => {
    const html = [
      "<section class=\"slide\" style=\"-webkit-hyphenate-character:'-';-webkit-hyphenate-limit-before:2;-webkit-hyphenate-limit-after:3;-webkit-hyphenate-limit-lines:2;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-hyphenate-character:\s*'-'/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-before:\s*2/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-after:\s*3/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-lines:\s*2/i);
  });
});
