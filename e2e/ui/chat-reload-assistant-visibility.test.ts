import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { applyStandardMocks } from '@/playwright/mock-factory';
import { dismissPrivacyDialog, expectWorkspaceReady, waitForLoadingToClear } from '@/playwright/amr';
import { T } from '@/timeouts';

const AUTO_CONTINUE_SENTINEL = '<!--od:auto_continue_incomplete_output-->';

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

async function createProjectWithConversation(page: Page, name: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `chat-reload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };
  expect(conversationId).toBeTruthy();
  return { projectId, conversationId };
}

async function seedAutoContinueReloadConversation(
  page: Page,
  projectId: string,
  conversationId: string,
): Promise<{ succeededId: string }> {
  const createdAt = Date.now() - 5_000;
  const userId = `u-reload-${projectId}`;
  const failedId = `a-failed-${projectId}`;
  const autoContinueUserId = `u-auto-${projectId}`;
  const succeededId = `a-succeeded-${projectId}`;

  const put = async (messageId: string, data: Record<string, unknown>) => {
    const response = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`,
      { data },
    );
    expect(response.ok(), `seed ${messageId}: ${await response.text()}`).toBeTruthy();
  };

  await put(userId, {
    id: userId,
    role: 'user',
    content: 'Create a short slide deck.',
    createdAt,
  });
  await put(failedId, {
    id: failedId,
    role: 'assistant',
    content: '',
    agentId: 'mock',
    runStatus: 'failed',
    resumable: true,
    startedAt: createdAt + 500,
    endedAt: createdAt + 1_000,
    createdAt: createdAt + 750,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Deliverable incomplete',
        code: 'incomplete_output',
      },
    ],
  });
  await put(autoContinueUserId, {
    id: autoContinueUserId,
    role: 'user',
    content: `${AUTO_CONTINUE_SENTINEL}\ncontinue`,
    createdAt: createdAt + 1_250,
  });
  await put(succeededId, {
    id: succeededId,
    role: 'assistant',
    content: '',
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 1_500,
    endedAt: createdAt + 2_000,
    createdAt: createdAt + 1_750,
    events: [{ kind: 'status', label: 'requesting' }],
    producedFiles: [],
  });

  return { succeededId };
}

async function openProject(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expectWorkspaceReady(page);
}

test('[P0] assistant rows stay visible after page reload when auto-continue ends in a sanitized empty shell', async ({
  page,
}) => {
  const { projectId, conversationId } = await createProjectWithConversation(
    page,
    `Chat reload assistant ${Date.now()}`,
  );
  const { succeededId } = await seedAutoContinueReloadConversation(page, projectId, conversationId);

  const assertPersistedSucceededShell = async () => {
    const messagesResponse = await page.request.get(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
    );
    expect(messagesResponse.ok()).toBeTruthy();
    const { messages } = (await messagesResponse.json()) as {
      messages: Array<{ id: string }>;
    };
    expect(messages.some((message) => message.id === succeededId)).toBe(true);
  };

  await assertPersistedSucceededShell();
  await openProject(page, projectId);
  const assistantRows = page.locator('.msg.assistant');
  await expect(assistantRows).toHaveCount(1, { timeout: T.medium });
  await expect(assistantRows).not.toContainText('Deliverable incomplete');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertPersistedSucceededShell();
  await openProject(page, projectId);

  await expect(page.locator('.msg.user').filter({ hasText: 'Create a short slide deck.' })).toBeVisible({
    timeout: T.medium,
  });
  await expect(page.locator('.msg.assistant')).toHaveCount(1);
  await expect(page.locator('.msg.assistant')).not.toContainText('Deliverable incomplete');
});

test('[P0] assistant prose survives reload when only message.content was persisted', async ({ page }) => {
  const { projectId, conversationId } = await createProjectWithConversation(
    page,
    `Chat reload prose ${Date.now()}`,
  );
  const createdAt = Date.now() - 2_000;
  const userId = `u-prose-${projectId}`;
  const assistantId = `a-prose-${projectId}`;
  const assistantText = 'Reload-visible assistant summary for the deck turn.';

  const put = async (messageId: string, data: Record<string, unknown>) => {
    const response = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`,
      { data },
    );
    expect(response.ok(), `seed ${messageId}: ${await response.text()}`).toBeTruthy();
  };

  await put(userId, {
    id: userId,
    role: 'user',
    content: 'Summarize the deck.',
    createdAt,
  });
  await put(assistantId, {
    id: assistantId,
    role: 'assistant',
    content: assistantText,
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 500,
    endedAt: createdAt + 1_500,
    createdAt: createdAt + 1_000,
    events: [],
    producedFiles: [],
  });

  await openProject(page, projectId);
  await expect(page.getByText(assistantText)).toBeVisible({ timeout: T.medium });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openProject(page, projectId);

  await expect(page.getByText(assistantText)).toBeVisible({ timeout: T.medium });
  await expect(page.locator('.msg.assistant')).toHaveCount(1);
});
