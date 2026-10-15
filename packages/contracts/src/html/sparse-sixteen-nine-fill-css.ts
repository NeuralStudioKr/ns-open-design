/**
 * 1007-N01 K/L — persist `[data-od-slide-flow]` is `position:absolute; inset:0;
 * display:flex; flex-direction:column`. Slide-level `justify-content:center`
 * (vertical-balance) never reaches the cluster, so g2 / quote / rule / dark
 * content pins to the top of 1920×1080 and the lower half reads empty.
 *
 * Layout only. No synthetic copy, no typo fixes, no KPI injection.
 * How-to official-rich persist (G/K) is unchanged — this is CSS.
 *
 * Scoped to `body.tpl-product-launch`: LOOK_NEUTRALIZE / persist pin also
 * ship this block, and unscoped `:has(.grid)` would stretch magazine/how-to
 * grids. Quote min-height uses `border:` (not `border`) so `border-radius`
 * alone does not inflate chrome.
 */

export const SPARSE_SIXTEEN_NINE_FILL_MARK = 'data-od-sparse-g2-fill';

const PL = 'body.tpl-product-launch';

const FLOW =
  `${PL} .slide:not(.s-cover):not(.slide-title):not(.cover):not(.s-quote)`
  + ':not(:has(.split-left)):not(:has(.split-right)):not(:has(.slide-inner))'
  + ' > [data-od-slide-flow]';

const DARK_FLOW =
  `${PL} .slide.dark:not(.s-cover):not(.slide-title):not(.cover):not(.s-quote)`
  + ':not(:has(.split-left)):not(:has(.slide-inner))'
  + ' > [data-od-slide-flow]';

const QUOTE =
  'blockquote,.quote,.quote-box,.quote-frame,.qframe,.statement-box';

export const SPARSE_SIXTEEN_NINE_FILL_CSS = [
  '/* od-sparse-16x9-fill (1007-N01 K/L) */',
  `${FLOW}:has(.grid.g2),`,
  `${FLOW}:has(> [style*="grid-template-columns"]),`,
  `${FLOW}:has(blockquote),`,
  `${FLOW}:has(.quote),`,
  `${FLOW}:has(.quote-box),`,
  `${FLOW}:has(.quote-frame),`,
  `${FLOW}:has(.qframe),`,
  `${FLOW}:has(.statement-box),`,
  `${FLOW}:has(.rule-label),`,
  `${DARK_FLOW}{`,
  'display:flex!important;flex-direction:column!important;',
  'justify-content:center!important;min-height:100%!important;height:100%!important;',
  'box-sizing:border-box!important}',
  `${PL} .slide>[data-od-slide-flow]>.deck-header{`,
  'position:absolute!important;top:24px!important;right:40px!important;bottom:auto!important;left:40px!important;z-index:4}',
  `${PL} .slide>[data-od-slide-flow]>.deck-footer{`,
  'position:absolute!important;top:auto!important;right:40px!important;bottom:24px!important;left:40px!important;z-index:4}',
  `${PL} .slide>[data-od-slide-flow]:has(>.deck-header){padding-top:56px!important}`,
  `${PL} .slide>[data-od-slide-flow]:has(>.deck-footer){padding-bottom:56px!important}`,
  `${FLOW}:has(.grid.g2) .grid.g2,`,
  `${FLOW}>[style*="grid-template-columns"]{`,
  'flex:1 1 auto!important;align-content:stretch!important;min-height:0!important}',
  `${FLOW}:has(.grid.g2) .grid.g2>*,`,
  `${FLOW}>[style*="grid-template-columns"]>*{`,
  'display:flex!important;flex-direction:column!important;justify-content:center!important}',
  `${FLOW}:is(:has(blockquote),:has(.quote),:has(.quote-box),:has(.quote-frame),:has(.qframe),:has(.statement-box)) :is(${QUOTE}),`,
  `${DARK_FLOW}>:is(${QUOTE}),`,
  // Quote-dominant dark slides (title + one quote card). Title+bullets+card
  // body slides must NOT get this min-height — it becomes a hollow gray
  // panel with the one-liner pinned to the bottom (1007-N01 O).
  `${DARK_FLOW}:not(:has(ul)):not(:has(ol)):not(:has(li)):not(:has(> .card ~ .card))>.card,`,
  `${DARK_FLOW}:not(:has(ul)):not(:has(ol)):not(:has(li))`
    + ':not(:has(> [style*="border:"] ~ [style*="border:"]))>[style*="border:"]:not(.deck-header):not(.deck-footer):not(.slide-number){',
  'flex:1 1 auto!important;align-self:stretch!important;width:100%!important;max-width:100%!important;',
  'min-height:clamp(240px,36%,420px)!important;box-sizing:border-box!important;',
  'padding-block:clamp(32px,5%,72px)!important;',
  'display:flex!important;flex-direction:column!important;justify-content:center!important}',
  `${DARK_FLOW}:is(:has(ul),:has(ol),:has(li))>.card,`,
  `${DARK_FLOW}:is(:has(ul),:has(ol),:has(li))>[style*="border:"]:not(.deck-header):not(.deck-footer){`,
  'flex:0 1 auto!important;min-height:0!important;align-self:stretch!important;',
  'justify-content:flex-start!important}',
  `${PL} .slide.s-cover :is(.chip,.pill,.cta,.btn,.tag):empty{display:none!important}`,
].join('');

const SPARSE_NEEDLE_RE =
  /\b(?:grid\s+g2|g2\s+grid|class="g2"|class='g2')\b|<(?:blockquote|figure)\b|\bclass\s*=\s*["'][^"']*\b(?:quote|qframe|quote-box|quote-frame|statement-box|pull-?quote|rule-label)\b|\bRULE\s*0?\d\b|<section\b[^>]*\bclass\s*=\s*["'][^"']*\bdark\b|grid-template-columns|style\s*=\s*["'][^"']*border\s*:/i;

export function htmlNeedsSparseSixteenNineFill(html: string): boolean {
  return SPARSE_NEEDLE_RE.test(String(html ?? ''));
}
