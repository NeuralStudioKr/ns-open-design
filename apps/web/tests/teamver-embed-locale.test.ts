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
    process.env.VITE_TEAMVER_EMBED = "1";
    const overrides = teamverEmbedOverrides("Teamver Design", "AI Design Studio", {
      title: "Teamver Design",
      subtitle: "Create with AI",
    });
    expect(overrides["chat.activeFilePlaceholder"]).toBe("슬라이드 {file} 변경 요청…");
    expect(overrides["chat.startTitle"]).toBe("슬라이드 작업 시작");
    expect(overrides["fileViewer.loading"]).toBe("슬라이드 미리보기 불러오는 중…");
    expect(overrides["common.loading"]).toBe("Teamver Design 불러오는 중…");
    expect(overrides["app.welcomeLoading"]).toBe("Teamver Design 불러오는 중…");
    expect(overrides["entry.loadingWorkspace"]).toBe("Teamver Design 불러오는 중…");
    expect(overrides["routines.loading"]).toBe("Teamver Design 불러오는 중…");
    expect(overrides["teamver.embed.sessionLoading"]).toBe("Teamver Design 불러오는 중…");
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

  it("interpolates vars on embed key overrides", () => {
    const overrides = teamverEmbedOverrides("Teamver Design");
    const base = resolveTeamverEmbedTranslation(
      "Open Design에 {file} 변경 요청...",
      { enabled: true, title: "Teamver Design" },
      overrides,
      "chat.activeFilePlaceholder",
    );
    expect(base).toBe("슬라이드 {file} 변경 요청…");
    expect(base.replace(/\{(\w+)\}/g, (_, name: string) => "deck.html")).toBe(
      "슬라이드 deck.html 변경 요청…",
    );
  });
});
