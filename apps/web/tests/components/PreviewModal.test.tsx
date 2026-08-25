import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PreviewModal } from '../../src/components/PreviewModal';

const here = dirname(fileURLToPath(import.meta.url));

describe('PreviewModal sandbox isolation', () => {
  it('renders generated previews without same-origin sandbox access', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Unsafe preview"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<script>window.parent.document.body.innerHTML="owned"</script>',
          },
        ]}
        exportTitleFor={() => 'unsafe-preview'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    expect(markup).not.toContain('allow-same-origin');
    expect(markup).toContain('srcDoc=');
    expect(markup).toContain('od:preview-escape');
  });

  it('keeps deck srcdoc handling for deck preview views', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Deck preview"
        views={[
          {
            id: 'deck',
            label: 'Deck',
            html: '<section class="slide">one</section><section class="slide">two</section>',
            deck: true,
          },
        ]}
        exportTitleFor={() => 'deck-preview'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    expect(markup).not.toContain('allow-same-origin');
    expect(markup).toContain('od:slide');
  });

  it('renders host prev/next slide chrome for deck community template previews', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Community template"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<section class="slide">one</section><section class="slide">two</section>',
            deck: true,
          },
        ]}
        exportTitleFor={() => 'community-template'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('preview-modal-deck-nav');
    expect(markup).toContain('preview-modal-deck-prev');
    expect(markup).toContain('preview-modal-deck-next');
    expect(markup).toContain('preview-modal-deck-counter');
  });

  it('uses panel icon for sidebar stage handle (not page-turn chevrons)', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Template with sidebar"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<section class="slide">one</section><section class="slide">two</section>',
            deck: true,
          },
        ]}
        sidebar={{ label: 'Details', content: <div>meta</div> }}
        exportTitleFor={() => 'template'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('ds-modal-stage-handle');
    // ‹/› looked like slide prev/next on the canvas edge.
    expect(markup).not.toMatch(/>‹</);
    expect(markup).not.toMatch(/>›</);
  });

  it('hides host slide chrome for non-deck previews', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Plain preview"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<div>hello</div>',
          },
        ]}
        exportTitleFor={() => 'plain'}
        onClose={() => {}}
      />,
    );

    expect(markup).not.toContain('preview-modal-deck-nav');
  });

  it('hides the share menu when hideShareMenu is set', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Template detail"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<section class="slide">one</section>',
            deck: true,
          },
        ]}
        shareTarget={{
          title: 'Template detail',
          url: 'https://example.com/templates/demo',
        }}
        hideShareMenu
        exportTitleFor={() => 'template'}
        onClose={() => {}}
      />,
    );

    expect(markup).not.toContain('template-share-menu');
    expect(markup).not.toContain('template-share-trigger');
    // Keep a dedicated open-in-new-tab affordance after Share is hidden.
    expect(markup).toContain('preview-modal-open-in-new-tab');
  });

  it('disables deck prev/next until slide-state arrives', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Deck waiting for bridge"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<section class="slide">one</section><section class="slide">two</section>',
            deck: true,
          },
        ]}
        exportTitleFor={() => 'deck'}
        onClose={() => {}}
      />,
    );

    expect(markup).toMatch(
      /data-testid="preview-modal-deck-prev"[^>]*\bdisabled\b/,
    );
    expect(markup).toMatch(
      /data-testid="preview-modal-deck-next"[^>]*\bdisabled\b/,
    );
  });

  it('uses a two-row header with toolbar for actions', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Toolbar layout"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<div>hello</div>',
          },
        ]}
        exportTitleFor={() => 'plain'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('ds-modal-header-toolbar');
    // Close stays on the title row, not inside the actions toolbar.
    expect(markup).toMatch(
      /ds-modal-header-top[\s\S]*ds-modal-close[\s\S]*ds-modal-header-toolbar/,
    );
  });

  it('hides compact+icon sidebar toggle on desktop via CSS cascade', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/styles/viewer/composio.css'),
      'utf8',
    );
    // --icon must not override --compact-only { display:none } on desktop.
    expect(css).toMatch(
      /\.ds-modal-sidebar-toggle--compact-only\.ds-modal-sidebar-toggle--icon\s*\{\s*display:\s*none;/,
    );
  });

  it('keeps open-in-new-tab and localized dialog label for template chrome', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Cobalt Grid"
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<section class="slide">one</section>',
            deck: true,
          },
        ]}
        hideShareMenu
        exportTitleFor={() => 'cobalt'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('preview-modal-open-in-new-tab');
    expect(markup).toContain('preview-modal-close');
    expect(markup).toMatch(/aria-label="(Cobalt Grid preview|Cobalt Grid 미리보기)"/);
    expect(markup).toMatch(/title="(Cobalt Grid preview|Cobalt Grid 미리보기)"/);
  });

  it('includes popup flags in the sandbox attribute', () => {
    const markup = renderToStaticMarkup(
      <PreviewModal
        title="Popup preview"
        views={[
          {
            id: 'popup',
            label: 'Popup',
            html: '<button onclick="window.open(\'https://example.com\')">Open Popup</button>',
          },
        ]}
        exportTitleFor={() => 'popup-preview'}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('allow-popups');
    expect(markup).toContain('allow-popups-to-escape-sandbox');
  });
});

describe('PreviewModal preview message guards', () => {
  it('wraps escape / slide-state / deck-host-viewport handlers', () => {
    const source = readFileSync(join(here, '../../src/components/PreviewModal.tsx'), 'utf8');
    expect(source).toContain("runFileViewerPreviewMessageHandler('preview-modal-escape'");
    expect(source).toContain("runFileViewerPreviewMessageHandler('preview-modal-slide-state'");
    expect(source).toContain(
      "runFileViewerPreviewMessageHandler('preview-modal-deck-host-viewport'",
    );
  });
});
