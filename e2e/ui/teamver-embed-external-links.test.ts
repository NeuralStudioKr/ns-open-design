import { expect, test } from '@playwright/test';
import { routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

const BLOCKED_EXTERNAL_HOSTS = [
  'github.com',
  'discord.gg',
  'discord.com',
  'nexu.io',
  'open-design.dev',
];

test.describe.configure({ timeout: 30_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEmbedHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stargazers_count: 51600 }),
    });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      streamFormat: 'plain',
      available: true,
    },
  ]);
});

test('Teamver embed home has no blocked external links (P-7)', async ({ page }) => {
  await gotoEmbedHome(page);

  const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('http://') || href.startsWith('https://')),
  );

  for (const href of hrefs) {
    const host = new URL(href).hostname.toLowerCase();
    for (const blocked of BLOCKED_EXTERNAL_HOSTS) {
      expect(host, `unexpected external link: ${href}`).not.toContain(blocked);
    }
  }

  await expect(page.getByTestId('assistant-feedback-discord-positive')).toHaveCount(0);
  await expect(page.getByTestId('assistant-feedback-discord-negative')).toHaveCount(0);
});

test('Teamver embed settings menu hides GitHub release link', async ({ page }) => {
  await gotoEmbedHome(page);
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  await expect(page.getByRole('link', { name: /GitHub|github/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Discord/i })).toHaveCount(0);
});
