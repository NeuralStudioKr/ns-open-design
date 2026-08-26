import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 80 (padding ≥1ic)", () => {
  it("binds 1ic card padding; keeps 1lh thin accent", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const card = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:1ic;border:1px solid tomato">card</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(card);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/border:\s*1px solid tomato/i);

    const thin = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:1lh;border:1px solid tomato">thin</span>',
      "</section>",
    ].join("");
    const kept = bindFakeOutlineCardsToOfficialKit(thin);
    expect(kept).toMatch(/border:\s*1px solid tomato/i);
    expect(kept).not.toMatch(/<span\b[^>]*\binfo-card\b/i);
  });
});
