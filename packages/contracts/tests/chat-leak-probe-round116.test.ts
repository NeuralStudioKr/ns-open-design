import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 116 (thin bdi accent keep)", () => {
  it("keeps thin-padding bdi/code unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<bdi style="padding:2px;border:1px solid tomato">bdi</bdi>',
      '<code style="padding-block:0.5ic;border:1px solid navy">code</code>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<bdi\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<code\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/border:\s*1px solid tomato/i);
  });
});
