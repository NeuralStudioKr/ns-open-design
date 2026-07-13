import type { Dict } from "../../i18n/types";
import { resolveEmbedBootstrapLoadingLabel } from "../branding/loadingShellLabel";

const OPEN_DESIGN_BRAND_RE = /Open Design/g;

/** Keep package names / CLI snippets inside backticks unchanged. */
export function applyTeamverBrandToLocalizedText(text: string, brandTitle: string): string {
  const brand = brandTitle.trim();
  if (!brand) return text;

  const segments = text.split(/(`[^`]*`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return segment;
      }
      return segment.replace(OPEN_DESIGN_BRAND_RE, brand);
    })
    .join("");
}

/** Teamver embed 모드 i18n 오버라이드 (10 §4.4). locale별 확장 가능. */
export function teamverEmbedOverrides(
  title: string,
  subtitle?: string,
  hero?: { title?: string; subtitle?: string },
): Partial<Dict> {
  // One fixed bootstrap string — Entry/Project/banner must not rewrite copy mid-paint.
  const bootstrapLoading = resolveEmbedBootstrapLoadingLabel();
  const overrides: Partial<Dict> = {
    "app.brand": title,
    "app.brandPill": "",
    "teamver.embed.sessionLoading": bootstrapLoading,
    "common.loading": bootstrapLoading,
    "app.welcomeLoading": bootstrapLoading,
    "entry.loadingWorkspace": bootstrapLoading,
    "routines.loading": bootstrapLoading,
  };
  if (subtitle?.trim()) {
    overrides["app.brandSubtitle"] = subtitle.trim();
  }
  if (hero?.title?.trim()) {
    overrides["homeHero.title"] = hero.title.trim();
  }
  // Hero subtitle is localized via `teamver.homeHero.subtitle` in embed HomeHero.
  // Project edit surface — strip OD product name from composer placeholders.
  overrides["chat.activeFilePlaceholder"] = "슬라이드 {file} 변경 요청…";
  overrides["chat.startTitle"] = "슬라이드 작업 시작";
  overrides["fileViewer.loading"] = "슬라이드 미리보기 불러오는 중…";
  overrides["fileViewer.updatingPreview"] = "슬라이드 업데이트 반영 중…";
  overrides["fileViewer.previewUnavailable"] =
    "슬라이드 미리보기를 불러올 수 없습니다. 잠시 후 다시 시도하거나 채팅에서 생성 상태를 확인해 주세요.";
  overrides["chat.attachAria"] = "파일 첨부";
  overrides["teamver.driveImport.attachFromMenu"] = "드라이브에서 가져오기";
  overrides["teamver.driveImport.pickHint"] = "클릭해 선택 · 더블클릭 또는 첨부 버튼으로 적용";
  return overrides;
}

export function resolveTeamverEmbedTranslation(
  raw: string,
  branding: { enabled: boolean; title: string },
  keyOverrides: Partial<Dict>,
  key: keyof Dict,
): string {
  const fromOverride = keyOverrides[key];
  const base = fromOverride ?? raw;
  if (!branding.enabled) return base;
  return applyTeamverBrandToLocalizedText(base, branding.title);
}
