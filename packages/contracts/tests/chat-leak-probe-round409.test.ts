import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 409 (leading-dot cm/in)", () => {
  it("binds .4cm and .15in card pads", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.4cm;border:1px solid tomato">a</span>',
      '<p style="padding:.15in;border:1px solid navy">b</p>',
      '<span style="padding:.2cm;border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.4cm[^>]*\binfo-card\b|info-card[^>]*\.4cm/i);
    expect(bound).toMatch(/\.15in[^>]*\binfo-card\b|info-card[^>]*\.15in/i);
    expect(bound).not.toMatch(/\.2cm[^>]*\binfo-card\b|info-card[^>]*\.2cm/i);
  });
});
