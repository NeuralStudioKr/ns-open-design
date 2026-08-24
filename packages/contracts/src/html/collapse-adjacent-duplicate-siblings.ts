/**
 * Collapse MiniMax-style echoed copy: the model rewrites the last completed
 * heading / paragraph / badge as an immediate sibling. Persist and preview
 * drop those adjacent duplicates so deck.html does not keep stacked twins.
 *
 * Non-adjacent repeats stay (intentional grid cells). Decorative punctuation
 * dots and empty spans stay. Structural hosts (section/div/li) are never
 * merged — only phrasing tags.
 *
 * Budgets: pathological / deeply nested / huge decks must never hang or
 * throw into React (project deep-link → error.tsx). Prefer no-op over crash.
 */

const COLLAPSIBLE_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'small',
  'strong',
  'em',
  'b',
  'i',
  'label',
  'button',
  'mark',
  'figcaption',
]);

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const PROTECTED_TAGS = new Set(['script', 'style', 'textarea', 'noscript']);

/** Skip collapse on oversized decks — preview still loads unrepaired HTML. */
export const COLLAPSE_MAX_INPUT_CHARS = 2_500_000;
/** Deep DOM nests: return subtree unchanged past this depth. */
export const COLLAPSE_MAX_DEPTH = 48;
/**
 * Shared step budget for parse + findMatchingClose. Exhaustion → treat as
 * unclosed / bail with remainder as raw (no throw, no infinite loop).
 */
export const COLLAPSE_MAX_STEPS = 100_000;

const OPEN_TAG_RE = /^<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/;

type RawNode = { kind: 'raw'; value: string };
type ElementNode = {
  kind: 'element';
  tag: string;
  open: string;
  close: string;
  inner: string;
};
type HtmlNode = RawNode | ElementNode;

type StepBudget = { left: number };

function findMatchingClose(
  html: string,
  openEnd: number,
  tag: string,
  budget: StepBudget,
): { innerEnd: number; closeEnd: number } | null {
  const openRe = new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  const closeRe = new RegExp(`<\\/${tag}\\s*>`, 'gi');
  let depth = 1;
  let cursor = openEnd;
  while (cursor < html.length && depth > 0) {
    if (budget.left <= 0) return null;
    budget.left -= 1;
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return {
        innerEnd: nextClose.index,
        closeEnd: nextClose.index + nextClose[0].length,
      };
    }
    cursor = nextClose.index + nextClose[0].length;
  }
  return null;
}

function normalizeComparableText(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Letter/number copy only — skip "•" rows and empty decorative spans. */
function isMeaningfulDuplicateText(text: string): boolean {
  return text.length >= 2 && /[\p{L}\p{N}]/u.test(text);
}

function isWhitespaceOnly(value: string): boolean {
  return /^\s*$/.test(value);
}

function parseTopLevel(html: string, budget: StepBudget): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    if (budget.left <= 0) {
      nodes.push({ kind: 'raw', value: html.slice(cursor) });
      break;
    }
    budget.left -= 1;
    const lt = html.indexOf('<', cursor);
    if (lt === -1) {
      nodes.push({ kind: 'raw', value: html.slice(cursor) });
      break;
    }
    if (lt > cursor) {
      nodes.push({ kind: 'raw', value: html.slice(cursor, lt) });
    }
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const closeEnd = end === -1 ? html.length : end + 3;
      nodes.push({ kind: 'raw', value: html.slice(lt, closeEnd) });
      cursor = closeEnd;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt + 2);
      const closeEnd = end === -1 ? html.length : end + 1;
      nodes.push({ kind: 'raw', value: html.slice(lt, closeEnd) });
      cursor = closeEnd;
      continue;
    }
    const openMatch = html.slice(lt).match(OPEN_TAG_RE);
    if (!openMatch) {
      nodes.push({ kind: 'raw', value: html.slice(lt, lt + 1) });
      cursor = lt + 1;
      continue;
    }
    const tag = (openMatch[1] ?? '').toLowerCase();
    const open = openMatch[0];
    const openEnd = lt + open.length;
    if (VOID_TAGS.has(tag) || /\/\s*>$/.test(open)) {
      nodes.push({ kind: 'raw', value: open });
      cursor = openEnd;
      continue;
    }
    const closed = findMatchingClose(html, openEnd, tag, budget);
    if (!closed) {
      nodes.push({ kind: 'raw', value: html.slice(lt) });
      break;
    }
    if (PROTECTED_TAGS.has(tag)) {
      nodes.push({ kind: 'raw', value: html.slice(lt, closed.closeEnd) });
      cursor = closed.closeEnd;
      continue;
    }
    nodes.push({
      kind: 'element',
      tag,
      open,
      close: html.slice(closed.innerEnd, closed.closeEnd),
      inner: html.slice(openEnd, closed.innerEnd),
    });
    cursor = closed.closeEnd;
  }
  return nodes;
}

function lastSignificantNode(nodes: HtmlNode[]): ElementNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!node) continue;
    if (node.kind === 'raw' && isWhitespaceOnly(node.value)) continue;
    return node.kind === 'element' ? node : null;
  }
  return null;
}

function canCollapseAdjacent(left: ElementNode, right: ElementNode): boolean {
  if (left.tag !== right.tag) return false;
  if (!COLLAPSIBLE_TAGS.has(left.tag)) return false;
  const leftText = normalizeComparableText(left.inner);
  if (!isMeaningfulDuplicateText(leftText)) return false;
  return leftText === normalizeComparableText(right.inner);
}

function serialize(nodes: HtmlNode[]): string {
  return nodes.map((node) => (
    node.kind === 'raw' ? node.value : `${node.open}${node.inner}${node.close}`
  )).join('');
}

function collapseTree(html: string, depth: number, budget: StepBudget): string {
  if (depth > COLLAPSE_MAX_DEPTH) return html;
  if (budget.left <= 0) return html;
  const nodes = parseTopLevel(html, budget);
  const rebuilt: HtmlNode[] = [];
  for (const node of nodes) {
    const next: HtmlNode = node.kind === 'element'
      ? { ...node, inner: collapseTree(node.inner, depth + 1, budget) }
      : node;
    const previous = lastSignificantNode(rebuilt);
    if (
      previous
      && next.kind === 'element'
      && canCollapseAdjacent(previous, next)
    ) {
      continue;
    }
    rebuilt.push(next);
  }
  return serialize(rebuilt);
}

/**
 * Drop immediately-adjacent sibling copies of the same heading / paragraph /
 * badge. No-ops (same string) when the document has no such twins.
 */
export function collapseAdjacentDuplicateDeckSiblings(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  if (source.length > COLLAPSE_MAX_INPUT_CHARS) return source;
  try {
    const budget: StepBudget = { left: COLLAPSE_MAX_STEPS };
    const collapsed = collapseTree(source, 0, budget);
    return collapsed === source ? source : collapsed;
  } catch {
    // Pathological / truncated decks must not take down preview (error.tsx).
    return source;
  }
}
