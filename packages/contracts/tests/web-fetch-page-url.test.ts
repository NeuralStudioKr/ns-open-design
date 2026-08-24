import { describe, expect, it } from 'vitest';
import {
  isWebFetchAssetUrlContext,
  isWebFetchPageContentType,
  isWebFetchPageUrl,
  looksLikeWebFetchStylesheetText,
} from '../src/web-fetch-page-url';

describe('isWebFetchPageUrl', () => {
  it('allows ordinary pages', () => {
    expect(isWebFetchPageUrl('https://teamver.com/')).toBe(true);
    expect(isWebFetchPageUrl('https://www.neuralstudio.kr/about')).toBe(true);
  });

  it('rejects Google Fonts css2 and kit CDNs', () => {
    expect(isWebFetchPageUrl('https://fonts.googleapis.com/css2')).toBe(false);
    expect(
      isWebFetchPageUrl(
        'https://fonts.googleapis.com/css2?family=Fredoka:wght@600&display=swap',
      ),
    ).toBe(false);
    expect(isWebFetchPageUrl('https://fonts.gstatic.com/s/fredoka/v1.woff2')).toBe(false);
    expect(isWebFetchPageUrl('https://fonts.bunny.net/css?family=inter')).toBe(false);
    expect(isWebFetchPageUrl('https://cdn.jsdelivr.net/npm/normalize.css')).toBe(false);
    expect(isWebFetchPageUrl('https://unpkg.com/react@18/umd/react.production.min.js')).toBe(
      false,
    );
  });

  it('rejects stylesheet and font file paths on unknown hosts', () => {
    expect(isWebFetchPageUrl('https://brand.example.com/theme.css')).toBe(false);
    expect(isWebFetchPageUrl('https://brand.example.com/fonts/Display.woff2')).toBe(false);
    expect(isWebFetchPageUrl('https://cdn.example.com/app.js')).toBe(false);
  });
});

describe('isWebFetchAssetUrlContext', () => {
  it('detects @import / url() / link / media src', () => {
    const kit = "@import url('https://brand.example.com/webfonts');";
    expect(isWebFetchAssetUrlContext(kit, kit.indexOf('https://'))).toBe(true);
    expect(isWebFetchAssetUrlContext(kit, kit.indexOf('brand.example.com'))).toBe(true);

    const link = '<link rel="stylesheet" href="https://brand.example.com/webfonts">';
    expect(isWebFetchAssetUrlContext(link, link.indexOf('https://'))).toBe(true);

    const img = '<img src="https://images.example.com/hero">';
    expect(isWebFetchAssetUrlContext(img, img.indexOf('https://'))).toBe(true);
  });

  it('does not treat prose or anchor href as an asset context', () => {
    const prose = 'https://teamver.com 참고해서 슬라이드 만들어줘.';
    expect(isWebFetchAssetUrlContext(prose, 0)).toBe(false);

    const anchor = 'See <a href="https://teamver.com">the site</a>';
    expect(isWebFetchAssetUrlContext(anchor, anchor.indexOf('https://'))).toBe(false);
  });
});

describe('isWebFetchPageContentType', () => {
  it('rejects stylesheet, font, image, and javascript types', () => {
    expect(isWebFetchPageContentType('text/css; charset=utf-8')).toBe(false);
    expect(isWebFetchPageContentType('font/woff2')).toBe(false);
    expect(isWebFetchPageContentType('image/png')).toBe(false);
    expect(isWebFetchPageContentType('application/javascript')).toBe(false);
  });

  it('detects raw stylesheet bodies', () => {
    expect(looksLikeWebFetchStylesheetText('@import url("https://fonts.googleapis.com/css2");')).toBe(
      true,
    );
    expect(looksLikeWebFetchStylesheetText('@font-face { font-family: X }')).toBe(true);
    expect(looksLikeWebFetchStylesheetText('<!doctype html><title>Hi</title>')).toBe(false);
  });

  it('allows html and unknown/empty types', () => {
    expect(isWebFetchPageContentType('text/html; charset=utf-8')).toBe(true);
    expect(isWebFetchPageContentType('text/plain')).toBe(true);
    expect(isWebFetchPageContentType('')).toBe(true);
  });
});
