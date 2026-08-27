import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 414 (form selective + dot rem)", () => {
  it("binds form with .75rem and leaves thin form unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:.75rem;border:1px solid navy">ok</form>',
      '<form style="padding:2px;border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<form\b[^>]*\.75rem[^>]*\binfo-card\b|<form\b[^>]*\binfo-card\b[^>]*\.75rem/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
  });
});
