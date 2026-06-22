import type { TeamverBrandingConfig } from "./config";

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

export function embedSlideOnlyOutboundBlockReason(
  prompt: string,
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): string | null {
  if (!branding.slideOnlyMvp) return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  if (!MEDIA_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  return "Teamver Design 1차 출시는 슬라이드(덱)만 지원합니다. 이미지·동영상·오디오·HyperFrames 생성 요청은 아직 처리할 수 없습니다. 슬라이드 덱으로 다시 요청해 주세요.";
}
