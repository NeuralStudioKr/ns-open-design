import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 85 (bookmark · footnote)", () => {
  it("copies bookmark/footnote/string-set into slide flow", () => {
    const html = [
      "<section class=\"slide\" style=\"bookmark-level:1;bookmark-label:'title';bookmark-state:open;string-set:title content();running:title;footnote-display:block;footnote-policy:auto;width:1920px;height:1080px\">",
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/bookmark-level:\s*1/i);
    expect(flow).toMatch(/bookmark-label:\s*'title'/i);
    expect(flow).toMatch(/bookmark-state:\s*open/i);
    expect(flow).toMatch(/string-set:\s*title content\(\)/i);
    expect(flow).toMatch(/running:\s*title/i);
    expect(flow).toMatch(/footnote-display:\s*block/i);
    expect(flow).toMatch(/footnote-policy:\s*auto/i);
  });
});
