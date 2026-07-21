// Plugins-home preview classifier — pure derivation contract.
//
// The home gallery picks a hero surface (image / video / iframe /
// design-system patch / text fallback) per plugin from `od.preview`,
// `od.useCase.exampleOutputs[]`, and the design-system tag/mode
// signal. This suite locks the discriminator + payload so a future
// manifest tweak can not silently reroute a tile to the wrong
// surface.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { inferPluginPreview } from '../../src/components/plugins-home/preview';

interface MakeArgs {
  id: string;
  manifestName?: string;
  title?: string;
  tags?: string[];
  mode?: string;
  designSystemRef?: string;
  preview?: Record<string, unknown>;
  bakedPreview?: Record<string, unknown>;
  exampleOutputs?: Array<{ path: string; title?: string }>;
  assets?: Array<string | { path: string }>;
}

function make(args: MakeArgs): InstalledPluginRecord {
  const context = {
    ...(args.designSystemRef
      ? { designSystem: { ref: args.designSystemRef } }
      : {}),
    ...(args.assets ? { assets: args.assets } : {}),
  };
  return {
    id: args.id,
    title: args.title ?? args.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: args.manifestName ?? args.id,
      version: '0.1.0',
      title: args.title ?? args.id,
      ...(args.tags ? { tags: args.tags } : {}),
      od: {
        kind: 'scenario',
        ...(args.mode ? { mode: args.mode } : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
        ...(args.preview ? { preview: args.preview } : {}),
        ...(args.bakedPreview ? { bakedPreview: args.bakedPreview } : {}),
        ...(args.exampleOutputs
          ? { useCase: { exampleOutputs: args.exampleOutputs } }
          : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('inferPluginPreview', () => {
  it('classifies image-template plugins as media/image', () => {
    const out = inferPluginPreview(
      make({
        id: 'img',
        preview: { type: 'image', poster: 'https://cdn/example.jpg' },
      }),
    );
    expect(out.kind).toBe('media');
    if (out.kind !== 'media') return;
    expect(out.mediaType).toBe('image');
    expect(out.poster).toBe('https://cdn/example.jpg');
    expect(out.imageOnly).toBe(true);
  });

  it('classifies video-template plugins as media/video with playable url', () => {
    const out = inferPluginPreview(
      make({
        id: 'vid',
        preview: {
          type: 'video',
          poster: 'https://cdn/poster.jpg',
          video: 'https://cdn/clip.mp4',
        },
      }),
    );
    expect(out.kind).toBe('media');
    if (out.kind !== 'media') return;
    expect(out.mediaType).toBe('video');
    expect(out.videoUrl).toBe('https://cdn/clip.mp4');
    expect(out.poster).toBe('https://cdn/poster.jpg');
    expect(out.imageOnly).toBe(false);
  });

  it('classifies audio plugins as media/audio with a playable audio url', () => {
    const out = inferPluginPreview(
      make({
        id: 'aud',
        preview: { type: 'audio', audio: 'https://cdn/jingle.mp3' },
      }),
    );
    expect(out.kind).toBe('media');
    if (out.kind !== 'media') return;
    expect(out.mediaType).toBe('audio');
    expect(out.audioUrl).toBe('https://cdn/jingle.mp3');
    expect(out.videoUrl).toBeNull();
  });

  it('classifies html-preview plugins as iframe-backed html surface', () => {
    const out = inferPluginPreview(
      make({
        id: 'ex',
        preview: { type: 'html', entry: './example.html' },
      }),
    );
    expect(out.kind).toBe('html');
    if (out.kind !== 'html') return;
    expect(out.src).toBe('/api/plugins/ex/preview');
    expect(out.label).toBe('example.html');
  });

  it('uses the install id (normalized) for marketplace-namespaced records', () => {
    const out = inferPluginPreview(
      make({
        id: 'open-design/example-html-ppt-zhangzara-creative-mode',
        manifestName: 'example-html-ppt-zhangzara-creative-mode',
        preview: { type: 'html', entry: './example.html' },
      }),
    );
    expect(out.kind).toBe('html');
    if (out.kind !== 'html') return;
    expect(out.src).toBe('/api/plugins/example-html-ppt-zhangzara-creative-mode/preview');
  });

  it('skips html preview fetch for skill scaffolds with assets but no HTML', () => {
    const out = inferPluginPreview(
      make({
        id: 'example-html-ppt',
        preview: { type: 'html', entry: './index.html' },
        assets: ['./assets/base.css', './assets/runtime.js', './references/themes.md'],
      }),
    );
    expect(out.kind).toBe('text');
  });

  it('uses /example when assets have no HTML but exampleOutputs declare HTML', () => {
    const out = inferPluginPreview(
      make({
        id: 'example-html-ppt',
        preview: { type: 'html', entry: './index.html' },
        assets: ['./assets/base.css', './references/themes.md'],
        exampleOutputs: [{ path: './examples/demo/index.html', title: 'Demo' }],
      }),
    );
    expect(out.kind).toBe('html');
    if (out.kind !== 'html') return;
    expect(out.src).toBe('/api/plugins/example-html-ppt/example/demo');
    expect(out.source).toBe('example');
  });

  it('falls back to the first exampleOutputs entry when no preview block is set', () => {
    const out = inferPluginPreview(
      make({
        id: 'wbr',
        exampleOutputs: [{ path: './examples/weekly/index.html', title: 'Weekly' }],
      }),
    );
    expect(out.kind).toBe('html');
    if (out.kind !== 'html') return;
    expect(out.src).toBe('/api/plugins/wbr/example/weekly');
    expect(out.label).toBe('Weekly');
  });

  it('uses baked previews for commercial slide templates when available', () => {
    const out = inferPluginPreview(
      make({
        id: 'commercial-deck',
        tags: ['commercial-slide-agent'],
        preview: { type: 'html', entry: './example.html' },
        bakedPreview: {
          poster: '/api/plugin-previews/commercial-deck/current/poster.jpg',
          video: '/api/plugin-previews/commercial-deck/current/preview.mp4',
          holdMs: 2500,
        },
      }),
      { preferBaked: true },
    );
    expect(out.kind).toBe('media');
    if (out.kind !== 'media') return;
    expect(out.mediaType).toBe('video');
    expect(out.poster).toBe('/api/plugin-previews/commercial-deck/current/poster.jpg');
    expect(out.videoUrl).toBe('/api/plugin-previews/commercial-deck/current/preview.mp4');
    expect(out.loopHoldMs).toBe(2500);
  });

  it('falls back to live HTML for commercial slide templates without a baked preview', () => {
    const out = inferPluginPreview(
      make({
        id: 'commercial-deck',
        tags: ['commercial-slide-agent'],
        preview: { type: 'html', entry: './example.html' },
      }),
      { preferBaked: true },
    );
    expect(out.kind).toBe('html');
    if (out.kind !== 'html') return;
    expect(out.src).toBe('/api/plugins/commercial-deck/preview');
  });

  it('renders design-system plugins (mode signal) as showcase-backed design surfaces', () => {
    const a = inferPluginPreview(
      make({
        id: 'ds-a',
        mode: 'design-system',
        title: 'Airbnb',
        designSystemRef: 'airbnb',
      }),
    );
    const b = inferPluginPreview(
      make({
        id: 'ds-a',
        mode: 'design-system',
        title: 'Airbnb',
        designSystemRef: 'airbnb',
      }),
    );
    expect(a.kind).toBe('design');
    if (a.kind !== 'design' || b.kind !== 'design') return;
    expect(a.brand).toBe('Airbnb');
    expect(a.designSystemId).toBe('airbnb');
    expect(a.swatches).toHaveLength(3);
    expect(a.swatches).toEqual(b.swatches);
  });

  it('treats the design-system tag as a fallback signal when mode is missing', () => {
    const out = inferPluginPreview(make({ id: 'ds-tag', tags: ['design-system'] }));
    expect(out.kind).toBe('design');
    if (out.kind !== 'design') return;
    expect(out.designSystemId).toBeNull();
  });

  it('returns text fallback for plain scenario plugins without preview material', () => {
    const out = inferPluginPreview(make({ id: 'scn', mode: 'prototype' }));
    expect(out.kind).toBe('text');
  });
});
