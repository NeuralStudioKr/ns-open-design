import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 420 (set69 combo)", () => {
  it("env fallback + FOO ↦ + Step keep", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:env(safe-area-inset-left, 14px);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ↦ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 3: Done")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ⟹ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
