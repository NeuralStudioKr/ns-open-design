import type { TeamverBrandingConfig } from "./config";

const EMBED_BLOCKED_COMPOSER_SLASH = /^\/(?:pet|hatch)\b/i;

const MEDIA_INTENT_PATTERNS: readonly RegExp[] = [
  /\b(generate|create|make|produce|render)\b.{0,40}\b(image|images|photo|picture|illustration|video|videos|clip|movie|audio|voiceover|hyperframes?|motion\s+graphic)\b/i,
  /\b(image|images|photo|video|videos|clip|audio|hyperframes?)\b.{0,40}\b(generate|create|make|produce|render)\b/i,
  /(이미지|사진|그림|일러스트).{0,20}(만들|생성|그려|제작)/u,
  /(만들|생성|제작).{0,20}(이미지|사진|그림|일러스트)/u,
  /(동영상|비디오|영상|클립).{0,20}(만들|생성|제작)/u,
  /(만들|생성|제작).{0,20}(동영상|비디오|영상|클립)/u,
  /(오디오|음성|보이스).{0,20}(만들|생성|제작)/u,
  /hyperframes/i,
];

/** Non-deck product surfaces — slide-only embed must not spawn these. */
const NON_DECK_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /\b(web\s*app|mobile\s*app|prototype|landing\s*page|dashboard|saas|admin\s*panel)\b/i,
  /(웹\s*앱|모바일\s*앱|프로토타입|랜딩\s*페이지|대시보드|관리자\s*페이지)/u,
  /(프로토타입|랜딩|대시보드|웹사이트|앱\s*UI).{0,24}(만들|생성|제작)/u,
  /(만들|생성|제작).{0,24}(프로토타입|랜딩|대시보드|웹사이트|앱\s*UI)/u,
];

/** Block inline `/pet` and `/hatch` slash commands in embed slide-only MVP (doc 13 C-7). */
export function embedBlockedComposerSlashReason(
  prompt: string,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): string | null {
  if (!branding.slideOnlyMvp) return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  if (!EMBED_BLOCKED_COMPOSER_SLASH.test(trimmed)) return null;
  return "teamver Design embed에서는 Codex 펫(/pet, /hatch) 명령을 사용할 수 없습니다. 슬라이드 덱 작업만 지원합니다.";
}

export function embedSlideOnlyOutboundBlockReason(
  prompt: string,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): string | null {
  if (!branding.slideOnlyMvp) return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  if (MEDIA_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "teamver Design 1차 출시는 슬라이드(덱)만 지원합니다. 이미지·동영상·오디오·HyperFrames 생성 요청은 아직 처리할 수 없습니다. 슬라이드 덱으로 다시 요청해 주세요.";
  }
  // Allow when the user explicitly asks for slides even if they also mention a product surface.
  if (/\b(slide|slides|deck|presentation)\b/i.test(trimmed) || /(슬라이드|덱|발표\s*자료|피치)/u.test(trimmed)) {
    return null;
  }
  if (NON_DECK_ARTIFACT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "teamver Design 1차 출시는 슬라이드(덱)만 지원합니다. 웹 프로토타입·랜딩·대시보드·앱 UI 요청은 처리할 수 없습니다. 슬라이드 덱으로 다시 요청해 주세요.";
  }
  return null;
}
