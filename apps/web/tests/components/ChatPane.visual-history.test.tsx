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
  AuthenticatedProjectFileImage: ({
    path,
    alt,
    fetchEnabled,
  }: {
    path: string;
    alt?: string;
    fetchEnabled?: boolean;
  }) => (
    fetchEnabled === false ? null : (
      <img data-testid="auth-project-image" src={`blob:${path}`} alt={alt || ''} />
    )
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
  it('renders visual comment marks as compact chips when attachments were dropped', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-visual',
        role: 'user',
        content: '이 영역 고쳐줘',
        createdAt: 1,
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
        projectFileNames={new Set(['uploads/visual-mark-1.png'])}
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

    expect(screen.getByText('시각 마크')).toBeTruthy();
    expect(screen.getByText('여기 텍스트 키워')).toBeTruthy();
    expect(screen.getByTestId('auth-project-image')).toBeTruthy();
  });

  it('does not duplicate visual screenshots as file attachment rows', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-visual-dup',
        role: 'user',
        content: '이 영역 고쳐줘',
        createdAt: 1,
        attachments: [
          {
            path: 'uploads/visual-mark-1.png',
            name: 'visual-mark-1.png',
            kind: 'image',
            order: 0,
          },
        ],
        commentAttachments: [
          {
            id: 'visual-mark-1',
            order: 0,
            filePath: 'index.html',
            elementId: 'visual-mark-1',
            selector: '',
            label: 'Visual mark',
            comment: '여기 텍스트 키워',
            currentText: '',
            pagePosition: { x: 0.2, y: 0.3 },
            htmlHint: '',
            selectionKind: 'visual',
            screenshotPath: 'visual-mark-1.png',
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
        projectFileNames={new Set(['uploads/visual-mark-1.png'])}
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

    expect(screen.getByTestId('auth-project-image')).toBeTruthy();
    expect(screen.getByText('시각 마크')).toBeTruthy();
    expect(screen.queryByText('visual-mark-1.png')).toBeNull();
  });

  it('keeps visual comment chips when the drawing screenshot file was deleted', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-visual-missing',
        role: 'user',
        content: '여기 고쳐줘',
        createdAt: 1,
        commentAttachments: [
          {
            id: 'visual-mark-missing',
            order: 1,
            filePath: 'ms798rzf-drawing-2026-07-30T08-31-44-563Z.png',
            elementId: 'visual-mark-missing',
            selector: '',
            label: 'Visual mark',
            comment: '여기',
            currentText: '',
            pagePosition: { x: 0.2, y: 0.3 },
            htmlHint: '',
            selectionKind: 'visual',
            screenshotPath: 'ms798rzf-drawing-2026-07-30T08-31-44-563Z.png',
            markKind: 'stroke',
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
        projectFiles={[]}
        projectFileNames={new Set(['deck.html'])}
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

    expect(screen.getByText('시각 마크')).toBeTruthy();
    expect(screen.getByText('여기')).toBeTruthy();
    expect(screen.getByTestId('auth-project-image')).toBeTruthy();
  });
});
