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

const COMPLETION_LEAD =
  /슬라이드 초안이 생성되었습니다\.|The slide deck draft is ready\.|작업이 완료되었습니다\.|The task is complete\./;

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
  await expect(page.getByText(COMPLETION_LEAD)).toBeVisible({ timeout: T.medium });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertPersistedSucceededShell();
  await openProject(page, projectId);

  await expect(page.locator('.msg.user').filter({ hasText: 'Create a short slide deck.' })).toBeVisible({
    timeout: T.medium,
  });
  await expect(page.locator('.msg.assistant')).toHaveCount(1);
  await expect(page.locator('.msg.assistant')).not.toContainText('Deliverable incomplete');
  await expect(page.getByText(COMPLETION_LEAD)).toBeVisible({ timeout: T.medium });
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

test('[P0] slide-edit completion lead survives reload after artifact sanitize + empty producedFiles PUT', async ({
  page,
}) => {
  const { projectId, conversationId } = await createProjectWithConversation(
    page,
    `Chat reload produced ${Date.now()}`,
  );
  const createdAt = Date.now() - 3_000;
  const userId = `u-prod-${projectId}`;
  const assistantId = `a-prod-${projectId}`;
  const editLead =
    /슬라이드 수정이 반영되었습니다\.|Slide updates have been applied\./;

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
    content: 'Edit the title on slide 1.',
    createdAt,
  });
  await put(assistantId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 500,
    endedAt: createdAt + 1_500,
    createdAt: createdAt + 1_000,
    events: [{ kind: 'status', label: 'requesting' }],
    producedFiles: [
      {
        name: 'deck.html',
        path: 'deck.html',
        kind: 'html',
        size: 2048,
        mtime: createdAt + 1_500,
      },
    ],
    preTurnFileNames: ['deck.html'],
  });
  // Simulate a later shell PUT that used to wipe deliverable evidence.
  await put(assistantId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 500,
    endedAt: createdAt + 1_500,
    createdAt: createdAt + 1_000,
    events: [{ kind: 'status', label: 'requesting' }],
    producedFiles: [],
    preTurnFileNames: [],
  });

  const messagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(messagesResponse.ok()).toBeTruthy();
  const { messages } = (await messagesResponse.json()) as {
    messages: Array<{ id: string; producedFiles?: unknown[]; preTurnFileNames?: unknown[] }>;
  };
  const assistant = messages.find((message) => message.id === assistantId);
  expect(assistant?.producedFiles?.length).toBeGreaterThan(0);
  expect(assistant?.preTurnFileNames?.length).toBeGreaterThan(0);

  await openProject(page, projectId);
  await expect(page.getByText(editLead)).toBeVisible({ timeout: T.medium });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openProject(page, projectId);
  await expect(page.getByText(editLead)).toBeVisible({ timeout: T.medium });
  await expect(page.locator('.msg.assistant')).toHaveCount(1);
});

test('[P0] historical succeeded empty-shell completion stays visible after a later turn', async ({
  page,
}) => {
  const { projectId, conversationId } = await createProjectWithConversation(
    page,
    `Chat reload history ${Date.now()}`,
  );
  const createdAt = Date.now() - 4_000;

  const put = async (messageId: string, data: Record<string, unknown>) => {
    const response = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`,
      { data },
    );
    expect(response.ok(), `seed ${messageId}: ${await response.text()}`).toBeTruthy();
  };

  await put(`u1-${projectId}`, {
    id: `u1-${projectId}`,
    role: 'user',
    content: 'Create a short slide deck.',
    createdAt,
  });
  await put(`a1-${projectId}`, {
    id: `a1-${projectId}`,
    role: 'assistant',
    content: '',
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 500,
    endedAt: createdAt + 1_000,
    createdAt: createdAt + 750,
    events: [{ kind: 'status', label: 'requesting' }],
    producedFiles: [],
  });
  await put(`u2-${projectId}`, {
    id: `u2-${projectId}`,
    role: 'user',
    content: 'Now change the palette.',
    createdAt: createdAt + 1_500,
  });
  await put(`a2-${projectId}`, {
    id: `a2-${projectId}`,
    role: 'assistant',
    content: 'Palette updated for the deck.',
    agentId: 'mock',
    runStatus: 'succeeded',
    startedAt: createdAt + 2_000,
    endedAt: createdAt + 2_500,
    createdAt: createdAt + 2_250,
    events: [],
    producedFiles: [],
  });

  await openProject(page, projectId);
  await expect(page.getByText(COMPLETION_LEAD)).toBeVisible({ timeout: T.medium });
  await expect(page.getByText('Palette updated for the deck.')).toBeVisible({ timeout: T.medium });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openProject(page, projectId);
  await expect(page.getByText(COMPLETION_LEAD)).toBeVisible({ timeout: T.medium });
  await expect(page.getByText('Palette updated for the deck.')).toBeVisible({ timeout: T.medium });
  await expect(page.locator('.msg.assistant')).toHaveCount(2);
});
