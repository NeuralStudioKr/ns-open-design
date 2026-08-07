import { describe, expect, it } from 'vitest';
import {
  resolveCanonicalProjectImagePath,
  rewriteAttachmentImageSrcs,
  sanitizeUploadFilename,
  stripUploadTimestampPrefix,
} from '../../src/utils/rewriteAttachmentImageSrcs';

describe('rewriteAttachmentImageSrcs', () => {
  it('rewrites original/local upload filenames to the timestamped on-disk path', () => {
    const stored = 'msh9y0i9-놀란-고양이-_1_.jpeg';
    const html = '<section class="slide"><img src="놀란 고양이 (1).jpeg" alt="놀란고양이"></section>';
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('rewrites sanitized basename without timestamp prefix', () => {
    const stored = 'msh9y0i9-photo.jpeg';
    const html = '<img src="photo.jpeg" alt="photo">';
    expect(rewriteAttachmentImageSrcs(html, [stored])).toBe(
      '<img src="msh9y0i9-photo.jpeg" alt="photo">',
    );
  });

  it('leaves exact on-disk paths untouched', () => {
    const stored = 'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg';
    const html = `<img src="${stored}" alt="">`;
    expect(rewriteAttachmentImageSrcs(html, [stored])).toBe(html);
  });

  it('rewrites Hangul NFD src to on-disk NFC Drive path', () => {
    const nfd = '금붕어'.normalize('NFD');
    const nfc = '금붕어'.normalize('NFC');
    expect(nfd).not.toBe(nfc);
    const stored = `refs/drive/msh9rso1-${nfc}.webp`;
    const html = `<img src="refs/drive/msh9rso1-${nfd}.webp" alt="">`;
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('prefers the newest timestamped local upload when multiple stems collide', () => {
    const html = '<img src="photo.jpeg" alt="">';
    const next = rewriteAttachmentImageSrcs(html, [
      'aaa111-photo.jpeg',
      'bbb222-photo.jpeg',
    ]);
    expect(next).toContain('src="bbb222-photo.jpeg"');
  });

  it('prefers the current-turn attachment path when stems collide', () => {
    const html = '<img src="photo.jpeg" alt="">';
    const next = rewriteAttachmentImageSrcs(
      html,
      ['aaa111-photo.jpeg', 'bbb222-photo.jpeg'],
      { preferredPaths: ['aaa111-photo.jpeg'] },
    );
    expect(next).toContain('src="aaa111-photo.jpeg"');
  });

  it('prefers the unique refs/drive path when a stem collides with a root upload', () => {
    const html = '<img src="hero.png" alt="hero">';
    const next = rewriteAttachmentImageSrcs(html, [
      'msh9y0i9-hero.png',
      'refs/drive/msh5lhfh-hero.png',
    ]);
    expect(next).toContain('src="refs/drive/msh5lhfh-hero.png"');
  });

  it('rewrites Drive basename-only src using attachment paths alone', () => {
    const stored = 'refs/drive/msh5lhfh-놀란고양이-_1_.jpeg';
    const html = '<img src="놀란고양이.jpeg" alt="놀란고양이">';
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('upgrades timestamped basename src to refs/drive even when preferredPaths poison exact match', () => {
    // Mention recovery stores ChatAttachment.path as the bare @mention basename
    // and unions it into the heal index — previously byExact short-circuited
    // and left preview resolving `{base}/msh9….webp` (404 → alt/filename only).
    const drive = 'refs/drive/msh9rso1-서빙하는-금붕어.webp';
    const basename = 'msh9rso1-서빙하는-금붕어.webp';
    const html = `<img src="${basename}" alt="서빙하는 금붕어">`;
    expect(
      rewriteAttachmentImageSrcs(html, [drive, basename], {
        preferredPaths: [basename],
      }),
    ).toContain(`src="${drive}"`);
  });

  it('resolveCanonicalProjectImagePath upgrades basename mentions to Drive', () => {
    const drive = 'refs/drive/msh9rso1-서빙하는-금붕어.webp';
    expect(
      resolveCanonicalProjectImagePath('msh9rso1-서빙하는-금붕어.webp', [drive]),
    ).toBe(drive);
  });

  it('ignores absolute and data URIs', () => {
    const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,xx">';
    expect(rewriteAttachmentImageSrcs(html, ['msh9y0i9-a.png'])).toBe(html);
  });

  it('strips a leading slash from project-relative image srcs', () => {
    const stored = 'refs/drive/msh5lhfh-hero.png';
    const html = `<img src="/${stored}" alt="">`;
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('rewrites CSS background-image urls that used a basename', () => {
    const stored = 'refs/drive/msh5lhfh-hero.png';
    const html = '<div style="background-image:url(\'hero.png\')"></div>';
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`url('${stored}')`);
  });

  it('decodes percent-encoded project-relative image srcs', () => {
    const stored = 'msh9y0i9-놀란-고양이.jpeg';
    const encoded = encodeURIComponent('놀란 고양이.jpeg');
    const html = `<img src="${encoded}" alt="">`;
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('strips a leading ./ from project-relative image srcs', () => {
    const stored = 'msh9y0i9-photo.jpeg';
    const html = '<img src="./photo.jpeg" alt="">';
    expect(rewriteAttachmentImageSrcs(html, [stored])).toContain(`src="${stored}"`);
  });

  it('prefers the newest refs/drive candidate when multiple Drive stems collide', () => {
    const html = '<img src="hero.png" alt="">';
    const next = rewriteAttachmentImageSrcs(html, [
      'refs/drive/aaa111-hero.png',
      'refs/drive/bbb222-hero.png',
    ]);
    expect(next).toContain('src="refs/drive/bbb222-hero.png"');
  });
});

describe('sanitizeUploadFilename / stripUploadTimestampPrefix', () => {
  it('mirrors daemon sanitize for spaced CJK names', () => {
    expect(sanitizeUploadFilename('놀란 고양이 (1).jpeg')).toBe('놀란-고양이-_1_.jpeg');
  });

  it('strips base36 upload prefixes', () => {
    expect(stripUploadTimestampPrefix('msh9y0i9-놀란-고양이-_1_.jpeg')).toBe(
      '놀란-고양이-_1_.jpeg',
    );
  });
});
