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
        "teamver Slide",
      ),
    ).toBe("teamver Slide에 브랜드, 제품, 코드, 에셋, 디자인 레퍼런스를 학습시키세요.");
  });

  it("skips replacements inside backticks", () => {
    expect(
      applyTeamverBrandToLocalizedText(
        "Types live in `@open-design/contracts` — Open Design ships them.",
        "teamver Slide",
      ),
    ).toBe("Types live in `@open-design/contracts` — teamver Slide ships them.");
  });

  it("merges explicit key overrides before brand substitution", () => {
    process.env.VITE_TEAMVER_EMBED = "1";
    const overrides = teamverEmbedOverrides("teamver Slide", "AI로 슬라이드·디자인 초안까지", {
      title: "teamver Slide",
      subtitle: "Create with AI",
    });
    expect(overrides["chat.activeFilePlaceholder"]).toBe("슬라이드 {file} 변경 요청…");
    expect(overrides["chat.startTitle"]).toBe("슬라이드 작업 시작");
    expect(overrides["chat.mode.design.solves"]).toContain("슬라이드 결과물");
    expect(overrides["chat.mode.design.solves"]).not.toContain("Open Design");
    expect(overrides["chat.amrCard.switchBody"]).toContain("공식 AMR");
    expect(overrides["chat.amrCard.switchBody"]).not.toContain("Open Design");
    expect(overrides["chat.amrCard.switchBody"]).not.toContain("teamver Slide");
    expect(overrides["settings.designTemplatesLockedDeck"]).toContain("이 워크스페이스");
    expect(overrides["settings.designTemplatesLockedDeck"]).not.toContain("Teamver embed");
    expect(overrides["settings.designTemplatesLockedDeck"]).not.toContain("Open Design");
    expect(overrides["homeHero.chip.createPluginHint"]).toContain("플러그인");
    expect(overrides["homeHero.chip.createPluginHint"]).not.toContain("Open Design");
    expect(overrides["homeHero.chip.createPluginHint"]).not.toContain("teamver Slide");
    expect(overrides["fileViewer.loading"]).toBe("슬라이드 미리보기 불러오는 중…");
    expect(overrides["fileViewer.updatingPreview"]).toBe("슬라이드 업데이트 반영 중…");
    expect(overrides["common.loading"]).toBe("불러오는 중…");
    expect(overrides["app.welcomeLoading"]).toBe("불러오는 중…");
    expect(overrides["entry.loadingWorkspace"]).toBe("불러오는 중…");
    expect(overrides["routines.loading"]).toBe("불러오는 중…");
    expect(overrides["teamver.embed.sessionLoading"]).toBe("불러오는 중…");
    const resolved = resolveTeamverEmbedTranslation(
      "Open Design",
      { enabled: true, title: "teamver Slide" },
      overrides,
      "app.brand",
    );
    expect(resolved).toBe("teamver Slide");
    expect(
      resolveTeamverEmbedTranslation(
        "Teach Open Design your brand.",
        { enabled: true, title: "teamver Slide" },
        overrides,
        "dsManager.createBody",
      ),
    ).toBe("Teach teamver Slide your brand.");
  });

  it("interpolates vars on embed key overrides", () => {
    const overrides = teamverEmbedOverrides("teamver Slide");
    const base = resolveTeamverEmbedTranslation(
      "Open Design에 {file} 변경 요청...",
      { enabled: true, title: "teamver Slide" },
      overrides,
      "chat.activeFilePlaceholder",
    );
    expect(base).toBe("슬라이드 {file} 변경 요청…");
    expect(base.replace(/\{(\w+)\}/g, (_, name: string) => "deck.html")).toBe(
      "슬라이드 deck.html 변경 요청…",
    );
  });
});
