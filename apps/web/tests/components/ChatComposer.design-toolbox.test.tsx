// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { CONNECTORS_CHANGED_EVENT } from '../../src/components/connectors-events';
import { composerText, flushMounts } from '../helpers/lexical-composer';

const DESIGN_TASTE_SKILL = {
  id: 'design-taste-frontend',
  name: 'design-taste-frontend',
  description: 'Anti-slop frontend polish for non-generic web design.',
  triggers: ['design taste', 'anti slop frontend', '反 AI 味'],
  mode: 'prototype' as const,
  surface: 'web' as const,
  category: 'creative-direction',
  previewType: 'html',
  designSystemRequired: true,
  defaultFor: [],
  upstream: 'https://github.com/Leonxlnx/taste-skill',
  hasBody: true,
  examplePrompt: 'Polish the current page.',
  aggregatesExamples: false,
};

const GSAP_SKILL = {
  ...DESIGN_TASTE_SKILL,
  id: 'gsap-core',
  name: 'gsap-core',
  description: 'Core GSAP animation primitives.',
  triggers: ['gsap', 'animation'],
  category: 'animation-motion',
  upstream: 'https://github.com/greensock/gsap-skills',
};

const CREATIVE_DIRECTOR_SKILL = {
  ...DESIGN_TASTE_SKILL,
  id: 'creative-director',
  name: 'creative-director',
  description: 'Directs the end-to-end design workflow.',
  triggers: ['creative director', 'design workflow'],
  category: 'creative-direction',
  upstream: 'https://github.com/smixs/creative-director-skill',
};

const SPREADSHEET_SKILL = {
  ...DESIGN_TASTE_SKILL,
  id: 'spreadsheet-ops',
  name: 'spreadsheet-ops',
  description: 'Analyze spreadsheet data before design decisions.',
  triggers: ['csv', 'data proof', 'spreadsheet'],
  category: 'documents',
  upstream: 'https://example.test/spreadsheet-ops',
};

const RESEARCH_PLUGIN = {
  id: 'research-assets',
  title: 'Research Asset Plugin',
  version: '1.0.0',
  sourceKind: 'bundled',
  source: 'official',
  trust: 'official',
  capabilitiesGranted: [],
  manifest: {
    name: 'research-assets',
    title: 'Research Asset Plugin',
    version: '1.0.0',
    description: 'Pulls proof points and market references into design work.',
    tags: ['research', 'proof', 'design'],
    od: { kind: 'scenario', mode: 'research' },
  },
  fsPath: '/tmp/research-assets',
  installedAt: 0,
  updatedAt: 0,
};

const HIGGSFIELD_MCP = {
  id: 'higgsfield',
  label: 'Higgsfield Video MCP',
  transport: 'http',
  enabled: true,
  url: 'https://mcp.higgsfield.ai/mcp',
};

const FIGMA_CONNECTOR = {
  id: 'figma',
  name: 'Figma',
  provider: 'composio',
  category: 'design',
  description: 'Reads Figma files and design references.',
  status: 'connected',
  accountLabel: 'Design Team',
  tools: [],
  allowedToolNames: ['FIGMA_GET_FILE'],
  curatedToolNames: ['FIGMA_GET_FILE'],
  toolCount: 1,
};

const GMAIL_CONNECTOR = {
  ...FIGMA_CONNECTOR,
  id: 'gmail',
  name: 'Gmail',
  category: 'email',
  description: 'Reads Gmail messages.',
  accountLabel: 'Inbox',
  allowedToolNames: ['GMAIL_FETCH_EMAILS'],
  curatedToolNames: ['GMAIL_FETCH_EMAILS'],
};

let fetchMock: ReturnType<typeof vi.fn>;

// The design toolbox left the "+" menu; it now opens as a standalone popover
// driven by the composer's imperative handle (the assistant "next step" card
// calls this in the real app). Tests open it the same way.
function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
  const ref = createRef<ChatComposerHandle>();
  const result = render(
    <ChatComposer
      ref={ref}
      projectId="project-1"
      projectFiles={[
        {
          name: 'index.html',
          path: 'index.html',
          type: 'file',
          size: 1024,
          mtime: 0,
          kind: 'html',
          mime: 'text/html',
        },
        {
          name: 'proof.csv',
          path: 'data/proof.csv',
          type: 'file',
          size: 512,
          mtime: 0,
          kind: 'spreadsheet',
          mime: 'text/csv',
        },
      ]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={[DESIGN_TASTE_SKILL, GSAP_SKILL]}
      activeWorkspaceContext={{
        id: 'file:index.html',
        kind: 'file',
        label: 'index.html',
        path: 'index.html',
      }}
      {...overrides}
    />,
  );
  return { ...result, ref };
}

function openToolbox(ref: { current: ChatComposerHandle | null }) {
  act(() => {
    ref.current?.openDesignToolbox();
  });
}

function fetchHref(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.toString();
  if (url instanceof Request) return url.url;
  return String(url);
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const href = fetchHref(url);
    if (href === '/api/mcp/servers' || href.endsWith('/api/mcp/servers')) {
      return new Response(JSON.stringify({
        servers: [HIGGSFIELD_MCP],
        templates: [
          {
            id: 'higgsfield-template',
            label: 'Higgsfield Template',
            description: 'Image and video generation MCP template.',
            transport: 'http',
            category: 'image-generation',
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // listPlugins uses query params (mode/limit); match the path prefix.
    if (href.includes('/api/plugins')) {
      return new Response(JSON.stringify({ plugins: [RESEARCH_PLUGIN] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('/api/connectors/discovery')) {
      return new Response(JSON.stringify({ connectors: [FIGMA_CONNECTOR, GMAIL_CONNECTOR] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('/api/connectors/status')) {
      return new Response(JSON.stringify({ statuses: { figma: { status: 'connected' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('/api/connectors')) {
      return new Response(JSON.stringify({ connectors: [FIGMA_CONNECTOR] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Teamver embed/dev stages image thumbs via authenticated /raw/ fetches.
    if (href.includes('/api/projects/') && href.includes('/raw/')) {
      return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer design toolbox', () => {
  it('stages a one-turn follow-up skill without patching the project skill', async () => {
    const onSend = vi.fn();
    const { ref } = renderComposer({ onSend });
    await flushMounts();

    openToolbox(ref);

    await waitFor(() => expect(screen.getByText('Remove AI feel')).toBeTruthy());
    fireEvent.click(screen.getByText('Remove AI feel'));

    await waitFor(() => {
      expect(composerText()).toContain('@design-taste-frontend');
      expect(composerText()).toContain('anti-AI-feel polish');
    });

    fireEvent.click(screen.getByTestId('chat-send'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[3]?.skillIds).toEqual(['design-taste-frontend']);
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('gives creative director a searchable index across all resource types', async () => {
    const { ref } = renderComposer({
      skills: [
        DESIGN_TASTE_SKILL,
        GSAP_SKILL,
        CREATIVE_DIRECTOR_SKILL,
        SPREADSHEET_SKILL,
      ],
    });
    await flushMounts();

    openToolbox(ref);

    // Wait for async catalog fetches (plugins/MCP/connectors) before searching.
    // In Teamver embed/dev some OpenDesign-branded plugins are hidden from the
    // toolbox UI, so probe a connector/MCP that always remains searchable.
    await waitFor(() => {
      expect(screen.getByText('Figma')).toBeTruthy();
      expect(screen.getByText('Higgsfield Video MCP')).toBeTruthy();
    });

    const search = screen.getByLabelText('Search design toolbox resources');
    fireEvent.change(search, { target: { value: 'proof' } });

    await waitFor(() => {
      expect(screen.getByText('data/proof.csv')).toBeTruthy();
    });

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByText('Match next step'));

    await waitFor(() => {
      expect(composerText()).toContain('@creative-director');
      expect(composerText()).toContain('Global resource index');
      expect(composerText()).toContain('spreadsheet-ops');
      expect(composerText()).toContain('Higgsfield Video MCP');
      expect(composerText()).toContain('Figma');
      expect(composerText()).toContain('data/proof.csv');
      expect(composerText()).toContain('Do not only use design toolbox recommendations');
    });
  });

  it('stages a design-file image as an attachment without dumping resource-index boilerplate', async () => {
    const onSend = vi.fn();
    const { ref } = renderComposer({
      onSend,
      projectFiles: [
        {
          name: 'index.html',
          path: 'index.html',
          type: 'file',
          size: 1024,
          mtime: 0,
          kind: 'html',
          mime: 'text/html',
        },
        {
          name: 'msh9rso1-serving-goldfish.webp',
          path: 'msh9rso1-serving-goldfish.webp',
          type: 'file',
          size: 2048,
          mtime: 0,
          kind: 'image',
          mime: 'image/webp',
        },
      ],
    });
    await flushMounts();

    openToolbox(ref);

    const search = screen.getByLabelText('Search design toolbox resources');
    fireEvent.change(search, { target: { value: 'goldfish' } });

    await waitFor(() => {
      expect(screen.getByText('msh9rso1-serving-goldfish.webp')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('msh9rso1-serving-goldfish.webp'));

    await waitFor(() => {
      expect(composerText()).toContain('@msh9rso1-serving-goldfish.webp');
    });
    expect(composerText()).not.toContain('Global resource index');
    expect(composerText()).not.toContain('Workflow rule');
    expect(composerText()).not.toContain('Reference design files');
    expect(composerText()).not.toContain('Searchable plugins');

    fireEvent.click(screen.getByTestId('chat-send'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    const attachments = onSend.mock.calls[0]?.[1] as Array<{ path: string; kind: string }>;
    expect(attachments.some((item) => item.path === 'msh9rso1-serving-goldfish.webp')).toBe(true);
  });

  it('refreshes connected connectors when connector auth changes in another surface', async () => {
    const { ref } = renderComposer();
    await flushMounts();

    openToolbox(ref);
    await waitFor(() => {
      expect(screen.getByText('Figma')).toBeTruthy();
    });

    window.dispatchEvent(new Event(CONNECTORS_CHANGED_EVENT));

    const search = screen.getByLabelText('Search design toolbox resources');
    fireEvent.change(search, { target: { value: 'gmail' } });

    await waitFor(() => {
      expect(screen.getByText('Gmail')).toBeTruthy();
    });
  });
});
