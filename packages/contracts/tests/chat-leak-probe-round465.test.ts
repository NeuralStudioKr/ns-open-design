import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 465 (set73–78 closure)", () => {
  it("calc sum / FOO arrows / invent-frame", () => {
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(8px + 4px);border:1px solid navy">a</span>',
      '<p style="padding:calc(.5rem + .25rem);border:1px solid teal">b</p>',
      '<span style="padding:calc(4px + 4px);border:1px solid tomato">thin</span>',
      '<form style="padding:2px;border:1px solid gold">thin-form</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/8px \+ 4px[^>]*\binfo-card\b|info-card[^>]*8px \+ 4px/i);
    expect(bound).toMatch(/\.5rem \+ \.25rem[^>]*\binfo-card\b|info-card[^>]*\.5rem \+ \.25rem/i);
    expect(bound).not.toMatch(/4px \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⟶ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ➢ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ➜ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
  });
});
