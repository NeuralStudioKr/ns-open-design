import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 321 (kit ul/ol/li thin stay unbound)", () => {
  it("keeps thin list hosts without card-like padding unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<ul style="border:1px solid navy;padding:2px"><li>a</li></ul>',
      '<ol style="border:1px solid tomato;padding:1px"><li>b</li></ol>',
      '<li style="border:1px solid teal;padding:0">c</li>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<ul\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<ol\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<li\b[^>]*\binfo-card\b/i);
  });
});
