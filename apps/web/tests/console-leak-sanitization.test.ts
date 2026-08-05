import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('browser console leak sanitization', () => {
  it('does not log slide/comment body fields from scoped deck-patch failures', () => {
    const source = readSrc('src/edit-mode/scoped-deck-patch.ts');
    expect(source).toContain("console.warn('[deck-patch] scoped narrow merge failed'");
    expect(source).toContain('currentTextLen:');
    expect(source).toContain('htmlHintLen:');
    expect(source).not.toMatch(
      /scoped narrow merge failed',\s*\{[\s\S]*?currentText:\s*attachment\.currentText/,
    );
    expect(source).not.toMatch(
      /scoped narrow merge failed',\s*\{[\s\S]*?htmlHint:\s*attachment\.htmlHint/,
    );
  });

  it('does not log working-directory paths or upload filename arrays', () => {
    const app = readSrc('src/App.tsx');
    expect(app).toContain('Failed to set working directory for new project');
    expect(app).toContain('hasWorkingDir:');
    expect(app).not.toMatch(
      /Failed to set working directory for new project',\s*userWorkingDir/,
    );
    expect(app).toContain('failedCount: uploadResult.failed.length');
    expect(app).not.toMatch(
      /Some Home attachments failed to upload',\s*uploadResult\.failed\b/,
    );
    expect(app).not.toMatch(
      /Some Home Drive attachments failed to import',\s*driveResult\.failed\b/,
    );

    const workspace = readSrc('src/components/FileWorkspace.tsx');
    expect(workspace).toContain('failedCount');
    expect(workspace).not.toMatch(/Project upload had failures',\s*result\.failed\b/);

    const composer = readSrc('src/components/ChatComposer.tsx');
    expect(composer).toContain('failedCount: result.failed.length');
    expect(composer).not.toMatch(/Some attachments failed to upload',\s*result\.failed\b/);
  });

  it('does not log fetchProjectFileText request URLs', () => {
    const source = readSrc('src/providers/registry.ts');
    expect(source).toContain("console.warn('[fetchProjectFileText] failed:'");
    expect(source).not.toMatch(
      /\[fetchProjectFileText\] failed:[\s\S]{0,200}url:\s*requestUrl/,
    );
  });
});
