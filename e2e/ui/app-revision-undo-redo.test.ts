import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

const ACTIVE_ARTIFACT_PREVIEW_SELECTOR =
  '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

const CONFLICT_TOAST_PATTERN = /Undo and Redo are unavailable/i;

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P1] revision undo survives design-files tab switch and redo restores the edit', async ({ page }) => {
  const fileName = 'revision-undo-redo.html';
  const projectId = await createProjectViaApi(page, 'Revision undo redo tab switch');
  await seedHtmlArtifact(page, projectId, fileName, revisionUndoRedoHtml());
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');

  const fontSizeInput = inspectorSection(page, 'TYPOGRAPHY')
    .locator('.cc-row')
    .filter({ hasText: 'Size' })
    .locator('input');
  await fontSizeInput.fill('48');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, fileName, ['font-size: 48px']);

  const title = frame.getByRole('heading', { name: 'Original Hero' });
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('48px');

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();
  await expectFileSourceExcludes(page, projectId, fileName, ['font-size: 48px']);
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).not.toBe('48px');

  await page.getByTestId('design-files-tab').click();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(artifactPreview(page)).toHaveCount(0);

  const fileTab = page.getByRole('tab', { name: new RegExp(escapeRegExp(fileName), 'i') });
  await fileTab.click();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expect(artifactPreview(page)).toBeVisible();

  const redo = page.getByTestId('file-viewer-redo');
  await expect.poll(async () => {
    const redoEnabled = await redo.isEnabled();
    const undoDisabled = await undo.isDisabled();
    const conflictCount = await page.getByRole('alert').filter({ hasText: CONFLICT_TOAST_PATTERN }).count();
    return redoEnabled && undoDisabled && conflictCount === 0;
  }, { timeout: 15_000 }).toBe(true);

  await redo.click();
  await expectFileSource(page, projectId, fileName, ['font-size: 48px']);
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('48px');
  await expect(redo).toBeDisabled();
  await expect(undo).toBeEnabled();
});

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

async function createProjectViaApi(page: Page, name: string): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const projectId = `revision-undo-redo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return projectId;
}

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const resp = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: fileName,
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: fileName,
        entry: fileName,
        renderer: 'html',
        exports: ['html'],
      },
    },
    timeout: 15_000,
  });
  expect(resp.ok()).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  const preview = artifactPreview(page);
  try {
    await preview.waitFor({ state: 'visible', timeout: 5_000 });
    return;
  } catch {
    // Not yet visible; try opening via tab or file list.
  }

  const filePattern = new RegExp(fileName.replace(/\./g, '\\.'), 'i');
  const fileTabButton = page.getByRole('tab', { name: filePattern }).first();
  let tabFound = true;
  try {
    await fileTabButton.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    tabFound = false;
  }

  if (tabFound) {
    await fileTabButton.click();
  } else {
    const fileButton = page.getByRole('button', { name: filePattern });
    await fileButton.click();
    await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
  }
  await expect(preview).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
}

async function expectFileSource(page: Page, projectId: string, fileName: string, snippets: string[]) {
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      return snippets.every((snippet) => source.includes(snippet));
    })
    .toBe(true);
}

async function expectFileSourceExcludes(page: Page, projectId: string, fileName: string, snippets: string[]) {
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      return snippets.every((snippet) => !source.includes(snippet));
    })
    .toBe(true);
}

async function selectPreviewElementThroughBridge(
  page: Page,
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
  section: string,
) {
  await expect(frame.locator('html[data-od-edit-mode]')).toHaveCount(1);
  await frame.locator(selector).click();
  await expect(page.locator('.manual-edit-modal')).toContainText(section);
  await expect(frame.locator(`${selector}[data-od-edit-selected="true"]`)).toHaveCount(1);
}

function inspectorSection(page: Page, title: string) {
  return page.locator('.manual-edit-modal .cc-section').filter({ hasText: title }).first();
}

function inspectSaveButton(page: Page) {
  return page.locator('.manual-edit-modal').getByRole('button', { name: /^Save$/ });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function revisionUndoRedoHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Revision Undo Redo</title>
  </head>
  <body style="font-family: Inter, system-ui, sans-serif; font-size: 16px;">
    <main>
      <section data-od-id="hero" data-od-label="Hero section">
        <h1 data-od-id="hero-title" data-od-label="Hero title">Original Hero</h1>
      </section>
    </main>
  </body>
</html>`;
}
