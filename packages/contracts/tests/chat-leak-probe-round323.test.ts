import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 323 (kit dl/figure selective)", () => {
  it("binds padded dl/dt/dd/figure and keeps thin unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<dl style="padding:16px;border:1px solid navy"><dt>t</dt><dd>d</dd></dl>',
      '<dt style="padding:12px;border:1px solid tomato">dt</dt>',
      '<dd style="padding:1rem;border:1px solid teal">dd</dd>',
      '<figure style="padding:16px;border:1px solid olive">fig</figure>',
      '<figure style="border:1px solid gold;padding:1px">thin</figure>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<dl\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<dt\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<dd\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<figure\b[^>]*padding:16px[^>]*\binfo-card\b|<figure\b[^>]*\binfo-card\b[^>]*padding:16px/i);
    expect(bound).not.toMatch(/<figure\b[^>]*padding:1px[^>]*\binfo-card\b/i);
  });
});
