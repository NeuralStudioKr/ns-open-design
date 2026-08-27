import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 267 (ms word/writing/combine)", () => {
  it("copies ms word/writing/combine", () => {
    const html = [
      '<section class="slide" style="-ms-word-break:break-all;-ms-word-wrap:break-word;-ms-writing-mode:tb-rl;-ms-text-combine-horizontal:all;-ms-text-combine-mode:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-word-break:\s*break-all/i);
    expect(flow).toMatch(/-ms-word-wrap:\s*break-word/i);
    expect(flow).toMatch(/-ms-writing-mode:\s*tb-rl/i);
    expect(flow).toMatch(/-ms-text-combine-horizontal:\s*all/i);
    expect(flow).toMatch(/-ms-text-combine-mode:\s*auto/i);
  });
});
