/**
 * Read the `description` field from a SKILL.md YAML frontmatter block.
 *
 * Bundled deck templates (Zhangzara / html-ppt family) put the concrete
 * visual contract — palette, type, motif — in frontmatter `description`,
 * often as a YAML block scalar (`description: |`). The body under the
 * frontmatter is meta ("copy from templates/…") that BYOK/API mode cannot
 * follow. Callers prepend this description as a `## Visual summary` so the
 * model still receives the visual contract after frontmatter is stripped.
 *
 * Important: a naive `description:\s*([^\n]+)` regex matches the bare `|`
 * indicator and returns `"|"`. That value is truthy, so `??` fallbacks to
 * the plugin manifest description never run, and
 * `body.includes("|")` short-circuits the prepend as a false positive.
 * Result: selected templates silently lose their visual spec and the deck
 * falls back to the default simple-deck look.
 */
export function readSkillFrontmatterDescription(raw: string): string | null {
  if (!raw.startsWith('---')) return null;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return null;
  const frontmatter = raw.slice(3, closeIdx).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const blockMatch =
    /(^|\n)description\s*:\s*([|>])([+-])?[ \t]*\n([\s\S]*?)(?=\n[^\s#]|\n*$)/u.exec(
      frontmatter,
    );
  if (blockMatch) {
    const block = blockMatch[4] ?? '';
    const lines = block.split('\n');
    let minIndent = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      if (!line.trim()) continue;
      const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
      if (indent < minIndent) minIndent = indent;
    }
    if (!Number.isFinite(minIndent)) return null;
    const text = lines
      .map((line) => (line.length >= minIndent ? line.slice(minIndent) : line))
      .join('\n')
      .replace(/\n+$/u, '')
      .trim();
    return text || null;
  }

  const match =
    /(^|\n)description\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\n]+))/u.exec(frontmatter);
  if (!match) return null;
  const value = (match[2] ?? match[3] ?? match[4] ?? '').trim();
  // Bare block indicators without a following indented block are not
  // descriptions — treat as missing so callers can fall back to manifest.
  if (!value || /^[|>][+-]?$/u.test(value)) return null;
  return value;
}
