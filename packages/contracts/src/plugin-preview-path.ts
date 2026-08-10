/**
 * Resolve the relative path of a plugin's live preview / example HTML.
 * Used when composing selected deck templates so BYOK runs can extract a
 * compact visual kit from `example.html` without mounting the whole folder.
 */
export function pickPluginPreviewHtmlPath(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return null;
  }
  const od = (manifest as { od?: unknown }).od;
  if (!od || typeof od !== 'object' || Array.isArray(od)) return null;
  const odRec = od as Record<string, unknown>;

  const candidates: string[] = [];
  const preview = odRec.preview;
  if (preview && typeof preview === 'object' && !Array.isArray(preview)) {
    const entry = (preview as { entry?: unknown }).entry;
    if (typeof entry === 'string' && entry.trim()) candidates.push(entry.trim());
  }
  const useCase = odRec.useCase;
  if (useCase && typeof useCase === 'object' && !Array.isArray(useCase)) {
    const outputs = (useCase as { exampleOutputs?: unknown }).exampleOutputs;
    if (Array.isArray(outputs)) {
      for (const item of outputs) {
        if (!item || typeof item !== 'object') continue;
        const p = (item as { path?: unknown }).path;
        if (typeof p === 'string' && p.trim()) candidates.push(p.trim());
      }
    }
  }
  const context = odRec.context;
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    const assets = (context as { assets?: unknown }).assets;
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (typeof asset === 'string' && asset.trim()) candidates.push(asset.trim());
      }
    }
  }
  // Common fallbacks for bundled deck templates.
  candidates.push('./example.html', 'example.html', './index.html', 'index.html');

  for (const raw of candidates) {
    if (!/\.html?$/i.test(raw)) continue;
    const safeRel = raw.startsWith('./') ? raw.slice(2) : raw.startsWith('/') ? raw.slice(1) : raw;
    if (!safeRel || safeRel.split('/').some((segment) => segment === '..')) continue;
    return safeRel;
  }
  return null;
}
