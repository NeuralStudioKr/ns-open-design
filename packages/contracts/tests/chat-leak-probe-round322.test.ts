import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 322 (kit ul/ol/li padded bind)", () => {
  it("binds list hosts with card-like padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<ul style="padding:16px;border:1px solid navy"><li>a</li></ul>',
      '<ol style="padding:12px;border:1px solid tomato"><li>b</li></ol>',
      '<li style="padding:0.75rem;border:1px solid teal">c</li>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<ul\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<ol\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<li\b[^>]*\binfo-card\b/i);
  });
});
