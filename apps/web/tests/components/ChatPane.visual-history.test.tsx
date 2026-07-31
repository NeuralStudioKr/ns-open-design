// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/components/AuthenticatedProjectFileImage', () => ({
  AuthenticatedProjectFileImage: ({ path, alt }: { path: string; alt?: string }) => (
    <img data-testid="auth-project-image" src={`blob:${path}`} alt={alt || ''} />
  ),
}));

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: () => true,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatPane visual mark history', () => {
  it('renders visual comment screenshots when normal attachments were dropped', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-visual',
        role: 'user',
        content: '이 영역 고쳐줘',
        createdAt: 1,
        // attachments intentionally missing — history merge / strip race.
        commentAttachments: [
          {
            id: 'visual-mark-1',
            order: 1,
            filePath: 'uploads/visual-mark-1.png',
            elementId: 'visual-mark-1',
            selector: '',
            label: 'Visual mark',
            comment: '여기 텍스트 키워',
            currentText: '',
            pagePosition: { x: 0.2, y: 0.3 },
            htmlHint: '',
            selectionKind: 'visual',
            screenshotPath: 'uploads/visual-mark-1.png',
            markKind: 'rect',
          },
        ],
      },
    ];

    render(
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[{ name: 'uploads/visual-mark-1.png', path: 'uploads/visual-mark-1.png' } as never]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[
          { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
        ]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
      />,
    );

    expect(screen.getByTestId('visual-history-attachment')).toBeTruthy();
    const img = screen.getByTestId('auth-project-image') as HTMLImageElement;
    expect(img.src).toContain('uploads/visual-mark-1.png');
    expect(screen.getByText('시각 마크')).toBeTruthy();
  });
});
