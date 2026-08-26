import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 69 — scroll-padding/margin longhands + math kit bind.
 */
describe("chat leak / persist probe round 69 (scroll-* · math kit)", () => {
  it("binds math/mrow fake frames with card-like padding", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<math style="padding:16px;border:1px solid tomato"><mrow>x</mrow></math>',
      '<mrow style="padding:12px;border:1px solid navy">y</mrow>',
      '<semantics style="padding:20px;border:2px solid gold">z</semantics>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<math\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<mrow\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<semantics\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/border:\s*1px solid tomato/i);
    expect(bound).not.toMatch(/border:\s*1px solid navy/i);
  });

  it("copies scroll-padding/margin longhands into slide flow", () => {
    const html = [
      '<section class="slide" style="scroll-padding-block:1rem;scroll-padding-inline:2rem;scroll-margin-block:8px;scroll-margin-inline:4px;overflow-clip-margin:content-box;contain-intrinsic-size:auto 200px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/scroll-padding-block:\s*1rem/i);
    expect(flowOpen).toMatch(/scroll-padding-inline:\s*2rem/i);
    expect(flowOpen).toMatch(/scroll-margin-block:\s*8px/i);
    expect(flowOpen).toMatch(/scroll-margin-inline:\s*4px/i);
    expect(flowOpen).toMatch(/overflow-clip-margin:\s*content-box/i);
    expect(flowOpen).toMatch(/contain-intrinsic-size:\s*auto 200px/i);
  });
});
