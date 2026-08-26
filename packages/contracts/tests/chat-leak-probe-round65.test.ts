import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 65 — address/hgroup/search kit bind and @custom-media scrub.
 */
describe("chat leak / persist probe round 65 (address kit · @custom-media)", () => {
  it("scrubs @custom-media/@stylistic dumps", () => {
    expect(looksLikeDeckCodeDebrisLine("@custom-media --wide (min-width: 800px);")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@stylistic { }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\n@custom-media --wide (min-width: 800px);", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\n@stylistic { }", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("binds address/hgroup/search fake frames to info-card", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<address style="padding:1rem;border:1px solid navy">addr</address>',
      '<hgroup style="padding:16px;border:1px solid tomato"><h2>t</h2></hgroup>',
      '<search style="padding:20px;border:2px solid gold">q</search>',
      '<data style="padding:12px;border:1px solid peru" value="1">d</data>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<address\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<hgroup\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<search\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<data\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/border:\s*1px solid navy/i);
    expect(bound).not.toMatch(/border:\s*1px solid tomato/i);
    expect(bound).not.toMatch(/border:\s*2px solid gold/i);
    expect(bound).not.toMatch(/border:\s*1px solid peru/i);
  });

  it("keeps thin accent text without card-like padding", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<data style="border:1px solid tomato" value="1">thin</data>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/border:\s*1px solid tomato/i);
    expect(bound).not.toMatch(/<data\b[^>]*\binfo-card\b/i);
  });
});
