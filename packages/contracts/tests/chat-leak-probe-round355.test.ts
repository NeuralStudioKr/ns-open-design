import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 355 (set56 section combo)", () => {
  it("binds padded section and leaves thin section unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:0.75rem;border:1px solid navy">ok</section>',
      '<section style="padding:3%;border:1px solid tomato">thin-pct</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<section\b[^>]*0\.75rem[^>]*\binfo-card\b|<section\b[^>]*\binfo-card\b[^>]*0\.75rem/i);
    expect(bound).not.toMatch(/3%[^>]*\binfo-card\b|info-card[^>]*3%/i);
  });
});
