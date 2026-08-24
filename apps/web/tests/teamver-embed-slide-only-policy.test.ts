import { describe, expect, it } from 'vitest';

import {
  communityGalleryFacetUi,
  isSlideRelatedPlugin,
  pluginsForSlideOnlyMvp,
  shouldHideCommunityPrimaryFacets,
  shouldShowHomeCommunityGallery,
  skillsForSlideOnlyMvp,
  SLIDE_ONLY_COMMUNITY_FACET_SELECTION,
} from '../src/teamver/branding/slideOnlyMvpPolicy';
import { embedBlockedComposerSlashReason, embedSlideOnlyOutboundBlockReason } from '../src/teamver/branding/embedSlideOnlyOutboundGuard';

describe('embed slide-only plugin policy', () => {
  it('keeps deck plugins only in slide-only MVP', () => {
    const deck = {
      id: 'deck-1',
      manifest: { name: 'deck-1', version: '1.0.0', od: { mode: 'deck' } },
    };
    const video = {
      id: 'video-1',
      manifest: { name: 'video-1', version: '1.0.0', od: { mode: 'video' } },
    };
    expect(isSlideRelatedPlugin(deck)).toBe(true);
    expect(isSlideRelatedPlugin(video)).toBe(false);
    expect(
      pluginsForSlideOnlyMvp([deck, video] as never[], { slideOnlyMvp: true }).map((p) => p.id),
    ).toEqual(['deck-1']);
  });

  it('hides the html-ppt prompt scaffold from slide-only Community lists', () => {
    const scaffold = {
      id: 'example-html-ppt',
      title: 'Html Ppt',
      manifest: { name: 'example-html-ppt', version: '0.1.0', od: { mode: 'deck' } },
    };
    const child = {
      id: 'example-html-ppt-zhangzara-studio',
      title: 'Html Ppt Studio',
      manifest: {
        name: 'example-html-ppt-zhangzara-studio',
        version: '0.1.0',
        od: { mode: 'deck' },
      },
    };
    expect(
      pluginsForSlideOnlyMvp([scaffold, child] as never[], { slideOnlyMvp: true }).map(
        (plugin) => plugin.id,
      ),
    ).toEqual(['example-html-ppt-zhangzara-studio']);
    expect(
      skillsForSlideOnlyMvp(
        [
          { id: 'html-ppt', name: 'html-ppt', mode: 'deck', triggers: [] },
          { id: 'html-ppt-studio', name: 'html-ppt-studio', mode: 'deck', triggers: [] },
        ] as never[],
        { slideOnlyMvp: true },
      ).map((skill) => skill.id),
    ).toEqual(['html-ppt-studio']);
  });

  it('defaults slide-only Community browsing to Creative decks', () => {
    expect(SLIDE_ONLY_COMMUNITY_FACET_SELECTION).toEqual({
      category: 'deck',
      subcategory: 'creative-decks',
    });
  });

  it('keeps slide-only Community visible when the full gallery is hidden', () => {
    expect(
      shouldShowHomeCommunityGallery({ slideOnlyMvp: true, hideCommunityGallery: true }),
    ).toBe(true);
    expect(
      shouldShowHomeCommunityGallery({ slideOnlyMvp: false, hideCommunityGallery: true }),
    ).toBe(false);
    expect(
      shouldShowHomeCommunityGallery({ slideOnlyMvp: false, hideCommunityGallery: false }),
    ).toBe(true);
  });

  it('hides primary Community facets in embed slide-only mode only', () => {
    expect(
      shouldHideCommunityPrimaryFacets({ slideOnlyMvp: true, hideCommunityGallery: true }),
    ).toBe(true);
    expect(
      shouldHideCommunityPrimaryFacets({ slideOnlyMvp: true, hideCommunityGallery: false }),
    ).toBe(false);
    expect(
      shouldHideCommunityPrimaryFacets({ slideOnlyMvp: false, hideCommunityGallery: true }),
    ).toBe(false);
    expect(communityGalleryFacetUi({ slideOnlyMvp: true, hideCommunityGallery: true })).toEqual({
      hidePrimaryCategoryFacets: true,
      lockedFacetCategory: 'deck',
    });
    expect(communityGalleryFacetUi({ slideOnlyMvp: false, hideCommunityGallery: false })).toEqual({
      hidePrimaryCategoryFacets: false,
      lockedFacetCategory: null,
    });
  });
});

describe('embedBlockedComposerSlashReason', () => {
  it('blocks /pet and /hatch in slide-only MVP', () => {
    expect(embedBlockedComposerSlashReason('/pet wake', { slideOnlyMvp: true })).toContain('펫');
    expect(embedBlockedComposerSlashReason('/hatch dragon', { slideOnlyMvp: true })).toContain('펫');
    expect(embedBlockedComposerSlashReason('/search foo', { slideOnlyMvp: true })).toBeNull();
    expect(embedBlockedComposerSlashReason('/pet wake', { slideOnlyMvp: false })).toBeNull();
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
      embedSlideOnlyOutboundBlockReason('이미지 만들어줘', { slideOnlyMvp: true }),
    ).toContain('슬라이드');
    expect(
      embedSlideOnlyOutboundBlockReason('10-slide investor deck', { slideOnlyMvp: true }),
    ).toBeNull();
  });

  it('allows attach-to-slide prompts that mention both images and slides', () => {
    expect(
      embedSlideOnlyOutboundBlockReason('이 이미지로 슬라이드 만들어줘', { slideOnlyMvp: true }),
    ).toBeNull();
    expect(
      embedSlideOnlyOutboundBlockReason('첨부한 사진을 슬라이드에 넣어줘', { slideOnlyMvp: true }),
    ).toBeNull();
    expect(
      embedSlideOnlyOutboundBlockReason('make a slide with this image', { slideOnlyMvp: true }),
    ).toBeNull();
    expect(
      embedSlideOnlyOutboundBlockReason('put this photo into the deck', { slideOnlyMvp: true }),
    ).toBeNull();
  });
});
