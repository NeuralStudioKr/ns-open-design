import { describe, expect, it } from "vitest";

import {
  applyTeamverBrandToLocalizedText,
  resolveTeamverEmbedTranslation,
  teamverEmbedOverrides,
} from "../src/teamver/locales/embedOverrides";

describe("teamver embed locale", () => {
  it("replaces Open Design with the embed brand title", () => {
    expect(
      applyTeamverBrandToLocalizedText(
        "Open Design에 브랜드, 제품, 코드, 에셋, 디자인 레퍼런스를 학습시키세요.",
        "Teamver Design",
      ),
    ).toBe("Teamver Design에 브랜드, 제품, 코드, 에셋, 디자인 레퍼런스를 학습시키세요.");
  });

  it("skips replacements inside backticks", () => {
    expect(
      applyTeamverBrandToLocalizedText(
        "Types live in `@open-design/contracts` — Open Design ships them.",
        "Teamver Design",
      ),
    ).toBe("Types live in `@open-design/contracts` — Teamver Design ships them.");
  });

  it("merges explicit key overrides before brand substitution", () => {
    const overrides = teamverEmbedOverrides("Teamver Design", "AI Design Studio", {
      title: "Teamver Design",
      subtitle: "Create with AI",
    });
    const resolved = resolveTeamverEmbedTranslation(
      "Open Design",
      { enabled: true, title: "Teamver Design" },
      overrides,
      "app.brand",
    );
    expect(resolved).toBe("Teamver Design");
    expect(
      resolveTeamverEmbedTranslation(
        "Teach Open Design your brand.",
        { enabled: true, title: "Teamver Design" },
        overrides,
        "dsManager.createBody",
      ),
    ).toBe("Teach Teamver Design your brand.");
  });
});
