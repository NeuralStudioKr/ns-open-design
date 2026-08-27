import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 327 (kit landmark padded bind)", () => {
  it("binds landmark hosts with card-like padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<article style="padding:16px;border:1px solid navy">a</article>',
      '<aside style="padding:12px;border:1px solid tomato">b</aside>',
      '<header style="padding:1rem;border:1px solid teal">h</header>',
      '<footer style="padding:0.75rem;border:1px solid olive">f</footer>',
      '<nav style="padding:16px;border:1px solid gold">n</nav>',
      '<main style="padding:12px;border:1px solid navy">m</main>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<article\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<aside\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<header\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<footer\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<nav\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<main\b[^>]*\binfo-card\b/i);
  });
});
