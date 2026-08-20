import { describe, expect, it } from 'vitest';
import {
  embedBlockedComposerSlashReason,
  embedSlideOnlyOutboundBlockReason,
} from '../../src/teamver/branding/embedSlideOnlyOutboundGuard';

describe('embedSlideOnlyOutboundGuard', () => {
  it('blocks pet slash commands without Open Design / teamver Slide product copy', () => {
    const reason = embedBlockedComposerSlashReason('/pet adopt', { slideOnlyMvp: true });
    expect(reason).toContain('Codex 펫');
    expect(reason).not.toContain('Open Design');
    expect(reason).not.toContain('teamver Slide');
  });

  it('blocks media and prototype asks without teamver Slide product copy', () => {
    const media = embedSlideOnlyOutboundBlockReason('generate an image of a cat', {
      slideOnlyMvp: true,
    });
    const proto = embedSlideOnlyOutboundBlockReason('랜딩 페이지 만들어줘', {
      slideOnlyMvp: true,
    });
    expect(media).toContain('슬라이드(덱)만 지원');
    expect(proto).toContain('슬라이드(덱)만 지원');
    expect(media).not.toContain('teamver Slide');
    expect(proto).not.toContain('teamver Slide');
    expect(media).not.toContain('Open Design');
  });
});
