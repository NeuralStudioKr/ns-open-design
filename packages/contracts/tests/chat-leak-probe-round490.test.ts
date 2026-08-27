import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 490 (set79–83 closure)", () => {
  it("% sum / rem+px / FOO triangles / invent-frame", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3% + 1%);border:1px solid navy">a</span>',
      '<p style="padding:calc(0.5rem + 4px);border:1px solid teal">b</p>',
      '<span style="padding:calc(2% + 1%);border:1px solid tomato">thin</span>',
      '<form style="padding:2px;border:1px solid gold">thin-form</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/3% \+ 1%[^>]*\binfo-card\b|info-card[^>]*3% \+ 1%/i);
    // 루프546 F7: mixed rem+px physical sum 12px is thin (round437 SSOT).
    expect(bound).not.toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/2% \+ 1%[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ▶ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ◆ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ➞ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
