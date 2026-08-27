import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 402 (@when + invent-frame)", () => {
  it("hardens @when and keeps border-top off flow", () => {
    expect(looksLikeDeckCodeDebrisLine("@when media(width > 1px) { .x{} }")).toBe(true);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="border-top:2px solid teal;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/border-top/i);
  });
});
