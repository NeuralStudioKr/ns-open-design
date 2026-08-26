import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 67 — form kit bind and font-palette/text-justify/wrap flow copy.
 */
describe("chat leak / persist probe round 67 (form kit · font-palette)", () => {
  it("binds form fake frames to info-card; keeps button/a unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:16px;border:1px solid tomato">f</form>',
      '<optgroup style="padding:12px;border:1px solid navy" label="g">o</optgroup>',
      '<datalist style="padding:12px;border:1px solid gold" id="d">x</datalist>',
      '<button style="padding:16px;border:1px solid tomato">b</button>',
      '<a style="padding:16px;border:1px solid tomato" href="#">a</a>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<form\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<optgroup\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<datalist\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<button\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<a\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<form\b[^>]*style="padding:16px"/i);
    expect(bound).toMatch(/<button\b[^>]*border:\s*1px solid tomato/i);
    expect(bound).toMatch(/<a\b[^>]*border:\s*1px solid tomato/i);
  });

  it("copies font-palette/text-justify/wrap into slide flow", () => {
    const html = [
      '<section class="slide" style="font-palette:normal;font-synthesis:none;font-kerning:normal;font-size-adjust:0.5;text-justify:inter-character;hyphenate-limit-last:always;line-break:strict;wrap-after:auto;wrap-before:auto;wrap-inside:avoid;box-snap:block-start;scroll-initial-target:nearest;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/font-palette:\s*normal/i);
    expect(flowOpen).toMatch(/font-synthesis:\s*none/i);
    expect(flowOpen).toMatch(/font-kerning:\s*normal/i);
    expect(flowOpen).toMatch(/font-size-adjust:\s*0\.5/i);
    expect(flowOpen).toMatch(/text-justify:\s*inter-character/i);
    expect(flowOpen).toMatch(/hyphenate-limit-last:\s*always/i);
    expect(flowOpen).toMatch(/line-break:\s*strict/i);
    expect(flowOpen).toMatch(/wrap-after:\s*auto/i);
    expect(flowOpen).toMatch(/wrap-before:\s*auto/i);
    expect(flowOpen).toMatch(/wrap-inside:\s*avoid/i);
    expect(flowOpen).toMatch(/box-snap:\s*block-start/i);
    expect(flowOpen).toMatch(/scroll-initial-target:\s*nearest/i);
  });
});
