import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 132 (thin pre accent keep)", () => {
  it("keeps thin-padding pre unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<pre style="padding:2px;border:1px solid tomato">x</pre>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<pre\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/border:\s*1px solid tomato/i);
  });
});
