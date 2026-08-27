import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 326 (kit landmark thin stay unbound)", () => {
  it("keeps thin article/aside/header/footer/nav/main unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<article style="border:1px solid navy;padding:2px">a</article>',
      '<aside style="border:1px solid tomato;padding:1px">b</aside>',
      '<header style="border:1px solid teal;padding:0">h</header>',
      '<footer style="border:1px solid olive;padding:1px">f</footer>',
      '<nav style="border:1px solid gold;padding:2px">n</nav>',
      '<main style="border:1px solid navy;padding:1px">m</main>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<(?:article|aside|header|footer|nav|main)\b[^>]*\binfo-card\b/i);
  });
});
