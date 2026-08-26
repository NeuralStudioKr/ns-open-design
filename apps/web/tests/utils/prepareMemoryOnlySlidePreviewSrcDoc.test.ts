import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareMemoryOnlySlidePreviewSrcDoc } from '../../src/utils/prepareMemoryOnlySlidePreviewSrcDoc';

describe('prepareMemoryOnlySlidePreviewSrcDoc', () => {
  it('heals basename image src and injects a /raw/ base href outside Teamver embed', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><img src="photo.jpeg" alt="photo"></section>',
      '</body></html>',
    ].join('');
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html,
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: ['msh9y0i9-photo.jpeg'],
      preferredAttachmentPaths: ['msh9y0i9-photo.jpeg'],
      teamverEmbedMode: false,
      embedPreviewPrefix: null,
    });
    expect(srcDoc).toContain('src="msh9y0i9-photo.jpeg"');
    expect(srcDoc).toMatch(/<base[^>]+href="\/api\/projects\/project-1\/raw\/"/i);
    expect(srcDoc).toContain('data-od-preview-image-retry');
  });

  it('omits base href in Teamver embed until a preview prefix is available', () => {
    const html = '<section class="slide"><img src="photo.jpeg" alt=""></section>';
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html,
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: ['msh9y0i9-photo.jpeg'],
      teamverEmbedMode: true,
      embedPreviewPrefix: null,
    });
    expect(srcDoc).toContain('src="msh9y0i9-photo.jpeg"');
    expect(srcDoc).not.toMatch(/<base\s+href=/i);
  });

  // Callers (FileWorkspace / FileViewer) must keep srcDoc empty while prefix
  // is null; this helper itself still heals srcs for when a prefix arrives.

  it('uses the scoped Teamver preview prefix for base href when present', () => {
    const html = '<section class="slide"><img src="photo.jpeg" alt=""></section>';
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html,
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: ['msh9y0i9-photo.jpeg'],
      teamverEmbedMode: true,
      embedPreviewPrefix: '/api/projects/project-1/preview/scope-abc',
    });
    expect(srcDoc).toMatch(
      /<base[^>]+href="\/api\/projects\/project-1\/preview\/scope-abc\/"/i,
    );
  });

  it('does not enable the deck bridge for slide-counter chrome only', () => {
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html: '<div class="slide-counter">1 / 10</div><div class="slide-chrome">Studio</div>',
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: [],
      teamverEmbedMode: false,
      embedPreviewPrefix: null,
    });
    expect(srcDoc).not.toContain('data-od-deck-bridge');
  });

  it('scrubs leftover IB catalog copy in project preview even without a user brief', () => {
    const html = readFileSync(
      resolve(import.meta.dirname, '../../../../plugins/_official/examples/ib-pitch-book/example.html'),
      'utf8',
    );
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html,
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: [],
      teamverEmbedMode: false,
      embedPreviewPrefix: null,
    });
    const visible = srcDoc.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(visible).not.toMatch(/Hartfield/i);
  });

  it('scrubs leftover IB catalog copy when the user brief is a different topic', () => {
    const html = readFileSync(
      resolve(import.meta.dirname, '../../../../plugins/_official/examples/ib-pitch-book/example.html'),
      'utf8',
    );
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html,
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: [],
      teamverEmbedMode: false,
      embedPreviewPrefix: null,
      userBrief: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    });
    const visible = srcDoc.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(visible).not.toMatch(/Hartfield/i);
    expect(srcDoc).not.toMatch(/WACC \(base\)/i);
  });

  it('enables the deck bridge for a real slide host', () => {
    const srcDoc = prepareMemoryOnlySlidePreviewSrcDoc({
      html: '<section class="slide"><h1>Cover</h1></section>',
      projectId: 'project-1',
      fileName: 'deck.html',
      projectFilePaths: [],
      teamverEmbedMode: false,
      embedPreviewPrefix: null,
    });
    expect(srcDoc).toContain('data-od-deck-bridge');
  });
});
