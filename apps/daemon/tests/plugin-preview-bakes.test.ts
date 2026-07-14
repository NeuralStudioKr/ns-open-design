import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyBakedPreviews } from '../src/plugin-preview-bakes.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-preview-bakes-'));
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      previews: {
        'example-html-ppt-hermes-cyber-terminal': {
          poster: 'hermes.poster.jpg',
          video: 'hermes.mp4',
          holdMs: 2500,
        },
      },
    }),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('applyBakedPreviews', () => {
  it('matches marketplace-namespaced plugin ids via manifest name', () => {
    const [record] = applyBakedPreviews(
      [
        {
          id: 'open-design/example-html-ppt-hermes-cyber-terminal',
          manifest: {
            name: 'example-html-ppt-hermes-cyber-terminal',
            od: { preview: { type: 'html', entry: './example.html' } },
          },
        },
      ],
      dir,
    );

    expect((record?.manifest as { od?: { bakedPreview?: unknown } }).od?.bakedPreview).toMatchObject({
      poster: 'https://repo-assets.open-design.ai/plugin-previews/hermes.poster.jpg',
      video: 'https://repo-assets.open-design.ai/plugin-previews/hermes.mp4',
      holdMs: 2500,
    });
  });

  it('matches marketplace entry names by their last path segment', () => {
    const [record] = applyBakedPreviews(
      [
        {
          id: 'local-install-id',
          sourceMarketplaceEntryName: 'open-design/example-html-ppt-hermes-cyber-terminal',
          manifest: {
            name: 'local-install-id',
            od: { preview: { type: 'html', entry: './example.html' } },
          },
        },
      ],
      dir,
    );

    expect((record?.manifest as { od?: { bakedPreview?: unknown } }).od?.bakedPreview).toBeTruthy();
  });
});
