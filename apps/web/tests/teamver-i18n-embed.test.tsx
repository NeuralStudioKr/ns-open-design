// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useT } from "../src/i18n";

vi.mock("../src/teamver/branding/TeamverBrandingProvider", () => ({
  useTeamverBranding: () => ({
    enabled: true,
    title: "Teamver Design",
    subtitle: "AI Design Studio",
    heroTitle: "Teamver Design",
    heroSubtitle: "Create with AI",
  }),
}));

describe("I18nProvider teamver embed", () => {
  it("rewrites dsManager copy for embed mode", () => {
    const { result } = renderHook(() => useT(), {
      wrapper: ({ children }) => <I18nProvider initial="ko">{children}</I18nProvider>,
    });

    expect(result.current("dsManager.createBody")).toBe(
      "Teamver Design에 브랜드, 제품, 코드, 에셋, 디자인 레퍼런스를 학습시키세요.",
    );
    expect(result.current("app.brand")).toBe("Teamver Design");
  });
});
