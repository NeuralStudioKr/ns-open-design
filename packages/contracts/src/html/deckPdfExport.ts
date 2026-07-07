/**
 * Shared deck PDF export helpers — keep daemon, web, and desktop flatten
 * logic in one place so print layout fixes ship together.
 */

export const DECK_SLIDE_SELECTOR =
  '.slide, [data-slide], [data-screen-label], section.slide, .deck-slide, .ppt-slide';

export const DECK_WRAPPER_SELECTOR =
  '.deck, .deck-shell, .deck-stage, #deck-stage, #deck, .stage';

export const DECK_CHROME_HIDE_SELECTOR =
  '.deck-counter, .deck-hint, .deck-nav, #deck-prev, #deck-next, #deck-cur, #deck-total, #nav, #hint, canvas.bg, #overview, [aria-label="Previous slide"], [aria-label="Next slide"]';

export const DECK_EXPORT_WIDTH = 1920;
export const DECK_EXPORT_HEIGHT = 1080;

function deckSlideSelectorList(): string[] {
  return DECK_SLIDE_SELECTOR.split(',').map((sel) => sel.trim());
}

/** Print flatten CSS shared by daemon, web, and desktop deck PDF export. */
export function buildDeckFlattenCssRules(): string {
  const slides = deckSlideSelectorList().join(', ');
  const slidesNotActive = deckSlideSelectorList().map((sel) => `${sel}:not(.active)`).join(', ');
  const slidesLastChild = deckSlideSelectorList().map((sel) => `${sel}:last-child`).join(', ');
  const wrappers = DECK_WRAPPER_SELECTOR.split(',').map((sel) => sel.trim()).join(',\n  ');
  return `
  html, body {
    width: ${DECK_EXPORT_WIDTH}px !important;
    height: auto !important;
    overflow: visible !important;
    background: var(--shell, var(--bg, #ffffff)) !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    display: block !important;
    scroll-snap-type: none !important;
    transform: none !important;
  }
  ${wrappers} {
    display: contents !important;
    transform: none !important;
  }
  ${slidesNotActive},
  ${slides} {
    display: block !important;
    flex: none !important;
    position: relative !important;
    inset: auto !important;
    width: ${DECK_EXPORT_WIDTH}px !important;
    height: ${DECK_EXPORT_HEIGHT}px !important;
    min-height: ${DECK_EXPORT_HEIGHT}px !important;
    max-height: ${DECK_EXPORT_HEIGHT}px !important;
    background: var(--bg, var(--shell, #ffffff)) !important;
    overflow: hidden !important;
    page-break-after: always !important;
    break-after: page !important;
    break-inside: avoid !important;
    scroll-snap-align: none !important;
    transform: none !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  ${slidesLastChild} {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  ${deckSlideSelectorList().map((sel) => `${sel}:first-child`).join(', ')} {
    page-break-before: avoid !important;
    break-before: avoid !important;
  }
  ${DECK_CHROME_HIDE_SELECTOR} {
    display: none !important;
  }`;
}

/** guizang-ppt relies on WebGL canvases + low-opacity ::before overlays. */
export function buildDeckGuizangPrintFallbackCss(): string {
  return `
  canvas.bg, #nav, #hint, #overview {
    display: none !important;
  }
  .slide.light::before {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(var(--paper-rgb), .95) !important;
  }
  .slide.dark::before {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(var(--ink-rgb), .92) !important;
  }
  .slide.hero.light::before {
    background: rgba(var(--paper-rgb), .92) !important;
  }
  .slide.hero.dark::before {
    background: rgba(var(--ink-rgb), .88) !important;
  }`;
}

export function buildDeckPrintCss(): string {
  return `
@media print {
  @page { size: ${DECK_EXPORT_WIDTH}px ${DECK_EXPORT_HEIGHT}px; margin: 0; }
  ${buildDeckFlattenCssRules()}${buildDeckGuizangPrintFallbackCss()}
}`;
}

/** Remove previously injected export styles/scripts so fresh rules win. */
export function stripStaleDeckExportArtifacts(doc: string): string {
  if (!doc) return doc;
  return doc
    .replace(/<style\b[^>]*\bdata-deck-print(?:=["'][^"']*["'])?[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*\bdata-od-headless-pdf[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*\bdata-od-desktop-pdf[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\bdata-deck-print-flatten[^>]*>[\s\S]*?<\/script>/gi, '');
}

/** Undo agent/framework print rules that break multi-slide deck PDF export. */
export function patchArtifactDeckPrintCss(doc: string): string {
  let out = stripStaleDeckExportArtifacts(doc);
  out = out.replace(
    /(@media\s+print[\s\S]*?html\s*,\s*body\s*\{[^}]*?)background\s*:\s*#fff\s*!important/gi,
    '$1background: var(--shell, var(--bg, #fff)) !important',
  );
  // Older injected flatten CSS forced every slide to column flex — breaks split layouts.
  out = out.replace(
    /(@media\s+print[\s\S]*?)([^{}]*\.(?:slide|deck-slide|ppt-slide)[^{]*\{[^}]*?)flex-direction\s*:\s*column\s*!important\s*;?/gi,
    '$1$2',
  );
  out = out.replace(
    /(@media\s+print[\s\S]*?)([^{}]*(?:\[data-screen-label\]|\[data-slide\])[^{]*\{[^}]*?)flex-direction\s*:\s*column\s*!important\s*;?/gi,
    '$1$2',
  );
  return out;
}

/** Browser-side layout helpers injected before print / headless PDF. */
export function buildDeckSlideExportLayoutHelperJs(): string {
  return `
      var CHROME_CHILD_CLASSES = ['grid-bg','win-chrome','cover-accent-bar','cover-grid-bg','mark'];
      function isChromeChild(child) {
        for (var i = 0; i < CHROME_CHILD_CLASSES.length; i++) {
          if (child.classList.contains(CHROME_CHILD_CLASSES[i])) return true;
        }
        return false;
      }
      function contentChildren(el) {
        return Array.from(el.children).filter(function(child) { return !isChromeChild(child); });
      }
      function resetAbsoluteLayer(el) {
        var pos = window.getComputedStyle(el).position;
        if (pos !== 'absolute' && pos !== 'fixed') return;
        set(el, 'position', 'relative');
        set(el, 'inset', 'auto');
        set(el, 'top', 'auto');
        set(el, 'right', 'auto');
        set(el, 'bottom', 'auto');
        set(el, 'left', 'auto');
      }
      function preserveNestedLayouts(root) {
        root.querySelectorAll('.two-col,.three-col,.stat-grid,.grid-2,.grid-3,.term-list,.chart-wrap,.roadmap-track,.agenda-rows,.points').forEach(function(el) {
          var cs = window.getComputedStyle(el);
          if (cs.display === 'grid') {
            set(el, 'display', 'grid');
            if (cs.gridTemplateColumns !== 'none') set(el, 'grid-template-columns', cs.gridTemplateColumns);
            if (cs.gridTemplateRows !== 'none') set(el, 'grid-template-rows', cs.gridTemplateRows);
            if (cs.gap && cs.gap !== 'normal') set(el, 'gap', cs.gap);
          } else if (cs.display === 'flex') {
            set(el, 'display', 'flex');
            set(el, 'flex-direction', cs.flexDirection);
            if (cs.gap && cs.gap !== 'normal') set(el, 'gap', cs.gap);
            set(el, 'align-items', cs.alignItems);
          }
        });
      }
      function applyLayoutToElement(el) {
        var children = contentChildren(el);
        var computed = window.getComputedStyle(el);
        var gridCols = computed.gridTemplateColumns;
        var gridColCount = gridCols && gridCols !== 'none'
          ? gridCols.split(' ').filter(function(col) { return col && col !== 'none'; }).length
          : 0;
        if (gridColCount >= 2) {
          set(el, 'display', 'grid');
          set(el, 'grid-template-columns', gridCols);
          set(el, 'grid-template-rows', computed.gridTemplateRows !== 'none' ? computed.gridTemplateRows : '1fr');
          set(el, 'align-items', 'stretch');
          set(el, 'justify-items', 'stretch');
        } else if (
          children.length >= 2
          && (computed.flexDirection === 'row' || computed.flexDirection === 'row-reverse')
        ) {
          set(el, 'display', 'flex');
          set(el, 'flex-direction', computed.flexDirection);
          set(el, 'align-items', 'stretch');
        } else if (
          computed.display === 'flex'
          && (computed.flexDirection === 'column' || computed.flexDirection === 'column-reverse')
        ) {
          set(el, 'display', 'flex');
          set(el, 'flex-direction', computed.flexDirection);
          set(el, 'align-items', computed.alignItems || 'stretch');
        } else if (children.length === 2) {
          var r0 = children[0].getBoundingClientRect();
          var r1 = children[1].getBoundingClientRect();
          var sideBySide = Math.abs(r0.top - r1.top) < 30 && r0.right <= r1.left + 10;
          set(el, 'display', 'flex');
          set(el, 'flex-direction', sideBySide ? 'row' : 'column');
          set(el, 'align-items', 'stretch');
        } else if (children.length >= 1) {
          set(el, 'display', 'flex');
          set(el, 'flex-direction', 'column');
          set(el, 'align-items', 'stretch');
        }
        var layoutDisplay = window.getComputedStyle(el).display;
        var layoutDir = window.getComputedStyle(el).flexDirection;
        children.forEach(function(child) {
          if (isChromeChild(child)) return;
          resetAbsoluteLayer(child);
          var childPos = window.getComputedStyle(child).position;
          if (childPos === 'absolute' || childPos === 'fixed') return;
          set(child, 'position', 'relative');
          set(child, 'inset', 'auto');
          set(child, 'transform', 'none');
          set(child, 'min-height', '0');
          set(child, 'min-width', '0');
          var isFooter = child.classList.contains('slide-footer')
            || child.classList.contains('s-foot')
            || child.classList.contains('edge-bar');
          if (layoutDisplay === 'grid' || layoutDir === 'row' || layoutDir === 'row-reverse') {
            set(child, 'flex', '1 1 0');
            set(child, 'height', '100%');
            set(child, 'max-height', '100%');
          } else if (isFooter) {
            set(child, 'flex', '0 0 auto');
            set(child, 'width', '100%');
          } else {
            set(child, 'flex', '1 1 auto');
            set(child, 'width', '100%');
            set(child, 'height', '100%');
            set(child, 'max-height', '100%');
          }
          if (
            child.classList.contains('split')
            || child.classList.contains('s-inner')
            || child.classList.contains('slide-inner')
          ) {
            applyLayoutToElement(child);
          }
        });
      }
      function applySlideExportLayout(slide) {
        var coverContent = slide.querySelector(':scope > .cover-content');
        var rightPanel = slide.querySelector(':scope > .cover-right-panel');
        if (coverContent && rightPanel) {
          resetAbsoluteLayer(coverContent);
          resetAbsoluteLayer(rightPanel);
          var footer = slide.querySelector(':scope > .slide-footer');
          if (footer) resetAbsoluteLayer(footer);
          var panelWidth = window.getComputedStyle(rightPanel).width || '560px';
          set(slide, 'display', 'grid');
          set(slide, 'grid-template-columns', '1fr ' + panelWidth);
          set(slide, 'grid-template-rows', '1fr auto');
          set(slide, 'align-items', 'stretch');
          set(coverContent, 'grid-column', '1');
          set(coverContent, 'grid-row', '1');
          set(coverContent, 'height', '100%');
          set(coverContent, 'width', '100%');
          set(rightPanel, 'grid-column', '2');
          set(rightPanel, 'grid-row', '1');
          set(rightPanel, 'height', '100%');
          set(rightPanel, 'width', '100%');
          if (footer) {
            set(footer, 'grid-column', '1 / -1');
            set(footer, 'grid-row', '2');
            set(footer, 'width', '100%');
          }
          preserveNestedLayouts(slide);
          return;
        }
        var children = contentChildren(slide);
        children.forEach(resetAbsoluteLayer);
        var layoutRoot = null;
        for (var i = 0; i < children.length; i++) {
          var c = children[i];
          if (
            c.classList.contains('split')
            || c.classList.contains('s-inner')
            || c.classList.contains('slide-inner')
          ) {
            layoutRoot = c;
            break;
          }
        }
        if (layoutRoot) {
          set(slide, 'display', 'flex');
          set(slide, 'flex-direction', 'column');
          set(slide, 'align-items', 'stretch');
          set(layoutRoot, 'flex', '1 1 auto');
          set(layoutRoot, 'width', '100%');
          set(layoutRoot, 'height', '100%');
          set(layoutRoot, 'min-height', '0');
          applyLayoutToElement(layoutRoot);
          children.forEach(function(child) {
            if (child === layoutRoot) return;
            if (child.classList.contains('slide-footer') || child.classList.contains('s-foot')) {
              set(child, 'flex', '0 0 auto');
              set(child, 'width', '100%');
            }
          });
          preserveNestedLayouts(slide);
          return;
        }
        applyLayoutToElement(slide);
        preserveNestedLayouts(slide);
      }
      function resolveSlidePrintBackground(el) {
        var rootStyle = window.getComputedStyle(document.documentElement);
        if (el.classList.contains('light')) {
          return rootStyle.getPropertyValue('--paper').trim() || '#f1efea';
        }
        if (el.classList.contains('dark')) {
          return rootStyle.getPropertyValue('--ink').trim() || '#0a0a0b';
        }
        if (
          el.querySelector('.panel-white,.panel-blue,.cover-right-panel,.split,.two-col,.three-col')
        ) {
          var panelBg = window.getComputedStyle(el).backgroundColor;
          if (!panelBg || panelBg === 'rgba(0, 0, 0, 0)' || panelBg === 'transparent') {
            return 'transparent';
          }
        }
        var bg = window.getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        return resolveShellBackground();
      }
  `;
}

/** One-liner to invoke flatten after the document is loaded in Chromium/Electron. */
export function buildDeckFlattenInvokeJs(): string {
  return `(function(){
    if (typeof window.__odFlattenDeckForPrint === 'function') {
      window.__odFlattenDeckForPrint();
      return true;
    }
    return false;
  })()`;
}

/** Inline script that defines window.__odFlattenDeckForPrint. */
export function buildDeckFlattenScriptTag(): string {
  const selector = DECK_SLIDE_SELECTOR;
  const wrap = DECK_WRAPPER_SELECTOR;
  const chrome = DECK_CHROME_HIDE_SELECTOR;
  const helper = buildDeckSlideExportLayoutHelperJs();
  return `<script data-deck-print-flatten>(function(){var SEL=${JSON.stringify(selector)};var WRAP=${JSON.stringify(wrap)};var CHROME=${JSON.stringify(chrome)};function set(el,p,v){el.style.setProperty(p,v,'important')}${helper}function resolveShellBackground(){var rs=getComputedStyle(document.documentElement);return rs.getPropertyValue('--shell').trim()||rs.getPropertyValue('--bg').trim()||rs.getPropertyValue('--ink').trim()||rs.getPropertyValue('background-color').trim()||'#0a0c10'}function resolveShellBg(){return resolveShellBackground()}window.__odFlattenDeckForPrint=function(){var slides=Array.from(document.querySelectorAll(SEL));if(!slides.length)return;document.querySelectorAll('canvas.bg').forEach(function(canvas){try{var dataUrl=canvas.toDataURL('image/png');if(!dataUrl||dataUrl==='data:,')return;var img=document.createElement('img');img.src=dataUrl;set(img,'position','fixed');set(img,'inset','0');set(img,'width','100%');set(img,'height','100%');set(img,'z-index','0');set(img,'pointer-events','none');set(img,'object-fit','cover');canvas.replaceWith(img)}catch(e){}});document.querySelectorAll(WRAP).forEach(function(el){set(el,'display','contents');set(el,'transform','none');set(el,'box-shadow','none')});var shellBg=resolveShellBackground();set(document.documentElement,'overflow','visible');set(document.documentElement,'width','1920px');set(document.documentElement,'background',shellBg);set(document.body,'overflow','visible');set(document.body,'display','block');set(document.body,'scroll-snap-type','none');set(document.body,'transform','none');set(document.body,'width','1920px');set(document.body,'background',shellBg);document.documentElement.style.setProperty('--deck-scale','1');slides.forEach(function(el,i){el.classList.add('active');applySlideExportLayout(el);set(el,'flex','none');set(el,'position','relative');set(el,'inset','auto');set(el,'width','1920px');set(el,'height','1080px');set(el,'min-height','1080px');set(el,'max-height','1080px');set(el,'background',resolveSlidePrintBackground(el));set(el,'transform','none');set(el,'overflow','hidden');set(el,'visibility','visible');set(el,'opacity','1');set(el,'page-break-after',i<slides.length-1?'always':'auto');set(el,'break-after',i<slides.length-1?'page':'auto');set(el,'break-inside','avoid');if(i===0){set(el,'page-break-before','avoid');set(el,'break-before','avoid')}});document.querySelectorAll(CHROME).forEach(function(el){set(el,'display','none')})}})();</script>`;
}

export function injectDeckFlattenScript(doc: string): string {
  const script = buildDeckFlattenScriptTag();
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${script}</head>`);
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}
