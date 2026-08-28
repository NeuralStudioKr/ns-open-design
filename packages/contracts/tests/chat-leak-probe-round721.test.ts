import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 721 (set128 closure)", () => {
  it("px+ch/lh/vb/cq + FOO + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(5px + 1ch);border:1px solid navy">a</span>',
      '<span style="padding:calc(5px + 0.5lh);border:1px solid teal">b</span>',
      '<span style="padding:calc(3px + 1cqw);border:1px solid purple">c</span>',
      '<p style="padding:calc(2px + 0.5ch);border:1px solid gray">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kit);
    expect(bound).toMatch(/5px \+ 1ch[^>]*\binfo-card\b|info-card[^>]*5px \+ 1ch/i);
    expect(bound).toMatch(/5px \+ 0\.5lh[^>]*\binfo-card\b|info-card[^>]*5px \+ 0\.5lh/i);
    expect(bound).toMatch(/3px \+ 1cqw[^>]*\binfo-card\b|info-card[^>]*3px \+ 1cqw/i);
    expect(bound).not.toMatch(/2px \+ 0\.5ch[^>]*\binfo-card\b/i);
    for (const g of ["❆", "☾", "☰", "⚙", "⚜"]) {
      expect(looksLikeDeckCodeDebrisLine(`FOOXYZ 1 ${g} XYZ`)).toBe(true);
    }
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ❆ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid blue;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
  });
});
