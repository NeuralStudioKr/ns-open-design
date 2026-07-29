import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TeamverDriveDisplayFileName } from "../src/teamver/components/TeamverDriveDisplayFileName";

describe("TeamverDriveDisplayFileName", () => {
  it("keeps the base display-filename class when a context className is passed", () => {
    const html = renderToStaticMarkup(
      <TeamverDriveDisplayFileName
        name="개발자 포트폴리오 예시로 2장 정도 만들면 이렇게.pptx"
        className="teamver-drive-import-card-name"
      />,
    );
    expect(html).toContain('class="teamver-drive-display-filename teamver-drive-import-card-name"');
    expect(html).toContain("teamver-drive-display-filename-stem");
    expect(html).toContain("teamver-drive-display-filename-ext");
    expect(html).toContain(".pptx");
  });

  it("uses the base class alone when no className is passed", () => {
    const html = renderToStaticMarkup(<TeamverDriveDisplayFileName name="deck.html" />);
    expect(html).toContain('class="teamver-drive-display-filename"');
    expect(html).not.toContain("teamver-drive-import-card-name");
  });
});
