import { describe, expect, it } from 'vitest';

import {
  isSlideRelatedPlugin,
  pluginsForSlideOnlyMvp,
  shouldShowEmbedSlideTemplateGallery,
} from '../src/teamver/branding/slideOnlyMvpPolicy';
import { embedSlideOnlyOutboundBlockReason } from '../src/teamver/branding/embedSlideOnlyOutboundGuard';

describe('embed slide-only plugin policy', () => {
  it('keeps deck plugins only in slide-only MVP', () => {
    const deck = { id: 'deck-1', manifest: { od: { mode: 'deck' } } };
    const video = { id: 'video-1', manifest: { od: { mode: 'video' } } };
    expect(isSlideRelatedPlugin(deck)).toBe(true);
    expect(isSlideRelatedPlugin(video)).toBe(false);
    expect(
      pluginsForSlideOnlyMvp([deck, video] as never[], { slideOnlyMvp: true }).map((p) => p.id),
    ).toEqual(['deck-1']);
  });

  it('shows deck-only home gallery when community gallery is hidden', () => {
    expect(
      shouldShowEmbedSlideTemplateGallery({ slideOnlyMvp: true, hideCommunityGallery: true }),
    ).toBe(true);
    expect(
      shouldShowEmbedSlideTemplateGallery({ slideOnlyMvp: false, hideCommunityGallery: true }),
    ).toBe(false);
  });
});

describe('embedSlideOnlyOutboundBlockReason', () => {
  it('blocks obvious image/video generation prompts in slide-only MVP', () => {
    expect(
      embedSlideOnlyOutboundBlockReason('동영상 생성해줘', { slideOnlyMvp: true }),
    ).toContain('슬라이드');
    expect(
      embedSlideOnlyOutboundBlockReason('generate a product video', { slideOnlyMvp: true }),
    ).toContain('슬라이드');
    expect(
      embedSlideOnlyOutboundBlockReason('10-slide investor deck', { slideOnlyMvp: true }),
    ).toBeNull();
  });
});
