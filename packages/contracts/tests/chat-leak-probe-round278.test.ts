import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 278 (epub text emphasis)", () => {
  it("copies epub text emphasis", () => {
    const html = [
      '<section class="slide" style="-epub-caption-side:bottom;-epub-text-transform:none;-epub-word-break:normal;-epub-text-emphasis:filled;-epub-text-emphasis-color:navy;-epub-text-emphasis-style:open;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-epub-caption-side:\s*bottom/i);
    expect(flow).toMatch(/-epub-text-transform:\s*none/i);
    expect(flow).toMatch(/-epub-word-break:\s*normal/i);
    expect(flow).toMatch(/-epub-text-emphasis:\s*filled/i);
    expect(flow).toMatch(/-epub-text-emphasis-color:\s*navy/i);
    expect(flow).toMatch(/-epub-text-emphasis-style:\s*open/i);
  });
});
