import { expect, test } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

test.describe.configure({ timeout: 30_000 });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

test('[P0] manual edit inspector previews and persists page and selected element styles', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  const responsivePair = frame.locator('[data-od-id="responsive-pair"]');
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.locator('html[data-od-edit-mode]')).toHaveCount(1);
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({ type: 'od-edit-background' }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('PAGE');
  await expect(page.locator('.manual-edit-tabs')).toHaveCount(0);
  await expect(page.getByTestId('manual-edit-layers-panel')).toHaveCount(0);

  await inspectorRow(page, 'Background').locator('input').fill('#eef2ff');
  await inspectorRow(page, 'Font').locator('select').selectOption('Georgia, serif');
  await inspectorRow(page, 'Base size').locator('input').fill('18');
  await expect(inspectorRow(page, 'Background').locator('input:not([type="color"])')).toHaveValue('#eef2ff');
  await expect(inspectorRow(page, 'Font').locator('select')).toHaveValue('Georgia, serif');
  await expect(inspectorRow(page, 'Base size').locator('input')).toHaveValue('18');

  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  const selectedTitleMarker = frame.locator('[data-od-id="hero-title"][data-od-edit-selected="true"]');
  await expect(selectedTitleMarker).toHaveCount(1);
  const fontSizeInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Size' }).locator('input');
  await fontSizeInput.click();
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(fontSizeInput).not.toHaveValue('');
  await expect(fontSizeInput).not.toHaveValue(/px/i);
  await expect(inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input')).toHaveValue(/^#[0-9a-f]{6}$/);
  const lineInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Line' }).locator('input');
  await lineInput.click();
  await lineInput.blur();
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);
  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({ type: 'od-edit-targets', targets: [] }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).not.toContainText('PAGE');
  await frame.locator('body').evaluate(() => {
    (window as Window & typeof globalThis & { __manualEditSmokeMarker?: string }).__manualEditSmokeMarker = 'stable-frame';
  });

  await fontSizeInput.fill('48');
  await inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input').fill('#ef4444');
  await expect(fontSizeInput).toHaveValue('48');

  const title = frame.getByRole('heading', { name: 'Original Hero' });
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('48px');
  await expect(title).toHaveCSS('color', 'rgb(239, 68, 68)');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'manual-edit.html', [
    'font-size: 48px',
    'color:',
  ]);
  await expectFileSourceExcludes(page, projectId, 'manual-edit.html', ['data-od-edit-selected']);
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);

  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible();
});

test('[P1] manual edit resize overlay appears for containers but not slide roots', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit resize smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.locator('[data-od-id="pair-a"]').click();
  await expect(page.locator('.manual-edit-modal')).toContainText('SIZE');
  await expect(page.getByTestId('manual-edit-resize-overlay')).toBeVisible();
  await expect(page.getByTestId('manual-edit-resize-handle-se')).toBeVisible();

  await seedDeckArtifact(page, projectId, 'manual-deck-resize.html', 'Resize Deck', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/manual-deck-resize.html`);
  await openDesignFile(page, 'manual-deck-resize.html');
  await page.getByTestId('manual-edit-mode-toggle').click();
  const deckFrame = artifactPreviewFrame(page);
  await deckFrame.locator('[data-od-id="slide-1"]').click();
  await expect(page.getByTestId('manual-edit-resize-overlay')).toHaveCount(0);
});

test('[P0] manual edit mode preserves preview actions after style edits', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  const fontSizeInput = await selectStyleRowInput(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY', 'Size');
  await fontSizeInput.fill('48');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'manual-edit.html', ['font-size: 48px']);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByRole('button', { name: /^Comment$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible();
});

test('[P1] manual edit drag-resize handle persists box width to source', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  // Teamver vite-dev on 127.0.0.1 hides entry-nav-new-project; create via daemon API.
  const projectId = await createProjectViaApi(page, 'Manual edit resize');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize.html`);
  await openDesignFile(page, 'manual-edit-resize.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.locator('[data-od-id="resize-box"]')).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');
  await expect(page.getByTestId('manual-edit-resize-overlay')).toBeVisible();

  const handle = page.getByTestId('manual-edit-resize-handle-e');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const match = source.match(/data-od-id="resize-box"[^>]*style="[^"]*width:\s*(\d+)px/);
      if (!match) return false;
      return Number(match[1]) > 120;
    })
    .toBe(true);
});

test('[P1] manual edit drag-resize undo restores width in one step', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize undo');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-undo.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-undo.html`);
  await openDesignFile(page, 'manual-edit-resize-undo.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const handle = page.getByTestId('manual-edit-resize-handle-e');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const match = source.match(/data-od-id="resize-box"[^>]*style="[^"]*width:\s*(\d+)px/);
      return !!match && Number(match[1]) > 120;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const match = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1] ?? '';
      const width = Number(match.match(/width:\s*(-?\d+)px/)?.[1] ?? NaN);
      // Undo should restore the seeded 120px width (or clear an injected wider width).
      return !Number.isFinite(width) || width === 120;
    })
    .toBe(true);
});

test('[P1] manual edit drag-resize Escape cancels without persisting width', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize escape');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-esc.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-esc.html`);
  await openDesignFile(page, 'manual-edit-resize-esc.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const handle = page.getByTestId('manual-edit-resize-handle-e');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY, { steps: 6 });
  await page.keyboard.press('Escape');

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize-esc.html`);
      if (!resp.ok()) return -1;
      const source = await resp.text();
      const match = source.match(/data-od-id="resize-box"[^>]*style="[^"]*width:\s*(\d+)px/);
      return match ? Number(match[1]) : -1;
    })
    .toBe(120);
});

test('[P1] manual edit drag-resize hides handles on deck slide root', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize slide');
  // `data-slide` marks a slide root for canResizeTarget without enabling the deck renderer
  // (which looks for `.slide` and can leave Preview stuck on Loading).
  await seedHtmlArtifact(
    page,
    projectId,
    'manual-edit-resize-slide.html',
    `<!doctype html><html><body>
      <section data-slide="0" data-od-id="slide-1" data-od-label="Slide One" style="width:640px;height:360px;background:#eee;">
        <h1>Slide One</h1>
      </section>
    </body></html>`,
  );
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-slide.html`);
  await openDesignFile(page, 'manual-edit-resize-slide.html');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.locator('[data-od-id="slide-1"]').click();
  await expect(frame.locator('[data-od-id="slide-1"][data-od-edit-selected="true"]')).toHaveCount(1);
  await expect(page.getByTestId('manual-edit-resize-overlay')).toHaveCount(0);
});

test('[P1] manual edit drag-resize E handle updates width without changing height', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize E-only');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-e.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-e.html`);
  await openDesignFile(page, 'manual-edit-resize-e.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const handle = page.getByTestId('manual-edit-resize-handle-e');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize-e.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const width = Number(style.match(/width:\s*(\d+)px/)?.[1] ?? NaN);
      const height = Number(style.match(/height:\s*(\d+)px/)?.[1] ?? NaN);
      return width > 120 && height === 80;
    })
    .toBe(true);
});

test('[P1] manual edit drag-resize hides overlay while Draw mode is active', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize draw');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-draw.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-draw.html`);
  await openDesignFile(page, 'manual-edit-resize-draw.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');
  await expect(page.getByTestId('manual-edit-resize-overlay')).toBeVisible();

  await page.getByTestId('draw-overlay-toggle').click();
  await expect(page.getByTestId('draw-overlay-toggle')).toHaveAttribute('aria-pressed', 'true');
  // §16: Draw mode must drop resize handles (selection/edit may also clear).
  await expect(page.getByTestId('manual-edit-resize-overlay')).toHaveCount(0);
});

test('[P1] manual edit drag-resize handles stay aligned at 75% zoom', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize zoom');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-zoom.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-zoom.html`);
  await openDesignFile(page, 'manual-edit-resize-zoom.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const zoomButton = page.locator('.viewer-toolbar-zoom .zoom-trigger');
  await zoomButton.click();
  const zoomMenu = page.locator('.zoom-menu-popover[role="menu"]');
  await expect(zoomMenu).toBeVisible();
  await zoomMenu.getByRole('menuitem', { name: '75%' }).click();
  await expect(zoomButton).toHaveText('75%');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const handle = page.getByTestId('manual-edit-resize-handle-e');
  await expect(overlay).toBeVisible();
  await expect(handle).toBeVisible();
  const overlayBox = await overlay.boundingBox();
  const handleBox = await handle.boundingBox();
  expect(overlayBox).toBeTruthy();
  expect(handleBox).toBeTruthy();
  // E handle sits on the right edge of the host overlay box (within hit padding).
  const handleCenterX = handleBox!.x + handleBox!.width / 2;
  expect(Math.abs(handleCenterX - (overlayBox!.x + overlayBox!.width))).toBeLessThan(12);
  expect(overlayBox!.width).toBeGreaterThan(40);
  expect(overlayBox!.height).toBeGreaterThan(20);
});

test('[P1] manual edit drag-resize keeps image aspect by default', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit resize image');
  await seedHtmlArtifact(page, projectId, 'manual-edit-resize-image.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-resize-image.html`);
  await openDesignFile(page, 'manual-edit-resize-image.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-image"]', 'IMAGE');
  await expect(page.getByTestId('manual-edit-resize-overlay')).toBeVisible();

  const handle = page.getByTestId('manual-edit-resize-handle-se');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Uneven delta — aspect lock should keep a square for the 64×64 image.
  await page.mouse.move(startX + 80, startY + 20, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-resize-image.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="hero-image"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const width = Number(style.match(/width:\s*(\d+)px/)?.[1] ?? NaN);
      const height = Number(style.match(/height:\s*(\d+)px/)?.[1] ?? NaN);
      if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return false;
      const ratio = width / height;
      return width > 64 && Math.abs(ratio - 1) < 0.08;
    })
    .toBe(true);
});

test('[P1] manual edit body-drag moves absolute box left/top in source', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit move');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move.html`);
  await openDesignFile(page, 'manual-edit-move.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="move-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-movable', 'true');

  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return left >= 60 && top >= 40;
    })
    .toBe(true);
});

test('[P1] manual edit body-drag Escape cancels without persisting left/top', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit move escape');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-esc.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-esc.html`);
  await openDesignFile(page, 'manual-edit-move-esc.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="move-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY + 40, { steps: 8 });
  await page.keyboard.press('Escape');

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-esc.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return left === 24 && top === 24;
    })
    .toBe(true);
});

test('[P1] manual edit body-drag Shift locks to dominant horizontal axis', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit move shift');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-shift.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-shift.html`);
  await openDesignFile(page, 'manual-edit-move-shift.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="move-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  // Dominant dx — top must stay at seed 24.
  await page.mouse.move(startX + 64, startY + 20, { steps: 8 });
  await page.keyboard.up('Shift');
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-shift.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return left >= 70 && top === 24;
    })
    .toBe(true);
});

test('[P1] manual edit promote reveals POSITION Left/Top fields', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit promote panel');
  await seedHtmlArtifact(page, projectId, 'manual-edit-promote-panel.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-promote-panel.html`);
  await openDesignFile(page, 'manual-edit-promote-panel.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  await expect(page.getByTestId('manual-edit-position-hint')).toBeVisible();
  await expect(page.locator('.manual-edit-modal .cc-row').filter({ hasText: 'Left' })).toHaveCount(0);

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('manual-edit-position-hint')).toHaveCount(0);
  await expect(page.locator('.manual-edit-modal .cc-row').filter({ hasText: 'Left' })).toHaveCount(1);
  await expect(page.locator('.manual-edit-modal .cc-row').filter({ hasText: 'Top' })).toHaveCount(1);
});

test('[P1] manual edit static target promote-on-drag writes relative left/top', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit static promote');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-static.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-static.html`);
  await openDesignFile(page, 'manual-edit-move-static.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-movable', 'true');
  await expect(page.getByTestId('manual-edit-position-hint')).toContainText(
    'Drag to offset this element (keeps it in flow).',
  );
  await expect(page.locator('.manual-edit-modal')).toContainText('POSITION');
  await expect(page.locator('.manual-edit-modal .cc-row').filter({ hasText: 'Left' })).toHaveCount(0);

  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-static.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const hasRelative = /position:\s*relative/.test(style);
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return hasRelative && Number.isFinite(left) && left >= 40 && Number.isFinite(top) && top >= 20;
    })
    .toBe(true);
});

test('[P1] manual edit static promote undo restores pre-promote source', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit static promote undo');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-static-undo.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-static-undo.html`);
  await openDesignFile(page, 'manual-edit-move-static-undo.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-static-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1];
      return !!style && /position:\s*relative/.test(style) && /\bleft\s*:/.test(style);
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-static-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1] ?? '';
      return !/position:\s*relative/.test(style) && !/\bleft\s*:/.test(style);
    })
    .toBe(true);
});

test('[P1] manual edit static promote Escape leaves source without relative offset', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit static promote esc');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-static-esc.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-static-esc.html`);
  await openDesignFile(page, 'manual-edit-move-static-esc.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="resize-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY + 40, { steps: 8 });
  await page.keyboard.press('Escape');

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-static-esc.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="resize-box"[^>]*style="([^"]*)"/)?.[1] ?? '';
      return !/position:\s*relative/.test(style) && !/\bleft\s*:/.test(style);
    })
    .toBe(true);
});

test('[P1] manual edit relative move accumulates authored left (not layout coords)', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit relative promote');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-relative.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-relative.html`);
  await openDesignFile(page, 'manual-edit-move-relative.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="relative-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toHaveAttribute('data-movable', 'true');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-relative.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="relative-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style || !/position:\s*relative/.test(style)) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      // Authored start left:10 + ~48 drag ⇒ ~58. Layout-based start (~50) would land ≥80.
      return Number.isFinite(left) && left >= 50 && left < 75;
    })
    .toBe(true);
});

test('[P1] manual edit W-resize keeps overlay aligned on nested absolute', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit nested W resize');
  await seedHtmlArtifact(page, projectId, 'manual-edit-nested-w-resize.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-nested-w-resize.html`);
  await openDesignFile(page, 'manual-edit-nested-w-resize.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  // Seeded nested absolute under relative-host (CB ≠ viewport) — no promote step.
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="nested-abs-box"]', 'SIZE');
  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toHaveAttribute('data-movable', 'true');

  const handle = page.getByTestId('manual-edit-resize-handle-w');
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + 32,
    handleBox!.y + handleBox!.height / 2,
    { steps: 6 },
  );

  const midTarget = await frame.locator('[data-od-id="nested-abs-box"]').boundingBox();
  const midOverlay = await overlay.boundingBox();
  expect(midTarget).toBeTruthy();
  expect(midOverlay).toBeTruthy();
  expect(Math.abs(midOverlay!.x - midTarget!.x)).toBeLessThan(14);
  expect(Math.abs(midOverlay!.y - midTarget!.y)).toBeLessThan(14);

  await page.mouse.up();
});

test('[P1] manual edit nested absolute re-drag keeps overlay aligned to CB', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit promote re-drag');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-relative-redrag.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-relative-redrag.html`);
  await openDesignFile(page, 'manual-edit-move-relative-redrag.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="nested-abs-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toHaveAttribute('data-movable', 'true');

  const beforeTarget = await frame.locator('[data-od-id="nested-abs-box"]').boundingBox();
  const beforeOverlay = await overlay.boundingBox();
  expect(beforeTarget).toBeTruthy();
  expect(beforeOverlay).toBeTruthy();
  expect(Math.abs(beforeOverlay!.x - beforeTarget!.x)).toBeLessThan(12);
  expect(Math.abs(beforeOverlay!.y - beforeTarget!.y)).toBeLessThan(12);

  // Drag: overlay must stay glued to the element (not jump to CB left/top).
  let box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 36, box!.y + box!.height / 2 + 18, { steps: 8 });

  const midTarget = await frame.locator('[data-od-id="nested-abs-box"]').boundingBox();
  const midOverlay = await overlay.boundingBox();
  expect(midTarget).toBeTruthy();
  expect(midOverlay).toBeTruthy();
  expect(Math.abs(midOverlay!.x - midTarget!.x)).toBeLessThan(14);
  expect(Math.abs(midOverlay!.y - midTarget!.y)).toBeLessThan(14);

  await page.mouse.up();

  await expect
    .poll(async () => {
      const targetBox = await frame.locator('[data-od-id="nested-abs-box"]').boundingBox();
      const overlayBox = await overlay.boundingBox();
      if (!targetBox || !overlayBox) return false;
      return Math.abs(overlayBox.x - targetBox.x) < 12
        && Math.abs(overlayBox.y - targetBox.y) < 12;
    })
    .toBe(true);
});

test('[P1] manual edit body-drag stays aligned and persists at 75% zoom', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit move zoom');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-zoom.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-zoom.html`);
  await openDesignFile(page, 'manual-edit-move-zoom.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="move-box"]', 'SIZE');

  const zoomButton = page.locator('.viewer-toolbar-zoom .zoom-trigger');
  await zoomButton.click();
  const zoomMenu = page.locator('.zoom-menu-popover[role="menu"]');
  await expect(zoomMenu).toBeVisible();
  await zoomMenu.getByRole('menuitem', { name: '75%' }).click();
  await expect(zoomButton).toHaveText('75%');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-movable', 'true');

  const targetBox = await frame.locator('[data-od-id="move-box"]').boundingBox();
  const overlayBox = await overlay.boundingBox();
  expect(targetBox).toBeTruthy();
  expect(overlayBox).toBeTruthy();
  expect(Math.abs(overlayBox!.x - targetBox!.x)).toBeLessThan(12);
  expect(Math.abs(overlayBox!.y - targetBox!.y)).toBeLessThan(12);
  expect(Math.abs(overlayBox!.width - targetBox!.width)).toBeLessThan(12);
  expect(Math.abs(overlayBox!.height - targetBox!.height)).toBeLessThan(12);

  const startX = overlayBox!.x + overlayBox!.width / 2;
  const startY = overlayBox!.y + overlayBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-zoom.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      // 75% zoom: host delta / 0.75 → content left/top must move past the seed.
      return left >= 60 && top >= 40;
    })
    .toBe(true);
});

test('[P1] manual edit deck fit-scale resize keeps overlay size after pointerup', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit deck fit resize');
  const fileName = 'manual-deck-fit-resize.html';
  await seedDeckFitScaleArtifact(page, projectId, fileName);
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await waitForDeckFitScaleReady(frame);
  await expectDeckFitScaleActive(frame, '[data-od-id="deck-resize-box"]');
  await expect(page.locator('.viewer-toolbar-zoom .zoom-trigger')).toHaveText('100%');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="deck-resize-box"]', 'SIZE');
  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toBeVisible();

  const before = await overlay.boundingBox();
  expect(before).toBeTruthy();
  const handle = page.getByTestId('manual-edit-resize-handle-se');
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 60, startY - 30, { steps: 8 });
  await page.mouse.up();

  const mid = await overlay.boundingBox();
  expect(mid).toBeTruthy();
  expect(mid!.width).toBeLessThan(before!.width - 12);
  expect(mid!.height).toBeLessThan(before!.height - 8);

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="deck-resize-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const width = Number(style.match(/width:\s*(\d+)px/)?.[1] ?? NaN);
      return Number.isFinite(width) && width > 0 && width < 220;
    })
    .toBe(true);

  await expectOverlayBoxStable(overlay, { width: mid!.width, height: mid!.height });
});

test('[P1] manual edit deck fit-scale move keeps overlay position after pointerup', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit deck fit move');
  const fileName = 'manual-deck-fit-move.html';
  await seedDeckFitScaleArtifact(page, projectId, fileName);
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await waitForDeckFitScaleReady(frame);
  await expectDeckFitScaleActive(frame, '[data-od-id="deck-move-box"]');
  await expect(page.locator('.viewer-toolbar-zoom .zoom-trigger')).toHaveText('100%');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="deck-move-box"]', 'SIZE');
  const overlay = page.getByTestId('manual-edit-resize-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-movable', 'true');

  const before = await overlay.boundingBox();
  expect(before).toBeTruthy();
  const startX = before!.x + before!.width / 2;
  const startY = before!.y + before!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 56, startY + 28, { steps: 8 });
  await page.mouse.up();

  const mid = await overlay.boundingBox();
  expect(mid).toBeTruthy();
  expect(mid!.x).toBeGreaterThan(before!.x + 20);
  expect(mid!.y).toBeGreaterThan(before!.y + 10);

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="deck-move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(\d+)px/)?.[1] ?? NaN);
      return Number.isFinite(left) && Number.isFinite(top) && left > 540 && top > 380;
    })
    .toBe(true);

  await expectOverlayBoxStable(overlay, { x: mid!.x, y: mid!.y });
});

test('[P1] manual edit deck fit-scale resize undo restores width in one step', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit deck fit resize undo');
  const fileName = 'manual-deck-fit-resize-undo.html';
  await seedDeckFitScaleArtifact(page, projectId, fileName);
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await waitForDeckFitScaleReady(frame);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="deck-resize-box"]', 'SIZE');

  const handle = page.getByTestId('manual-edit-resize-handle-se');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 60, startY - 30, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const width = Number(source.match(/data-od-id="deck-resize-box"[^>]*style="[^"]*width:\s*(\d+)px/)?.[1] ?? NaN);
      return Number.isFinite(width) && width > 0 && width < 220;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const width = Number(source.match(/data-od-id="deck-resize-box"[^>]*style="[^"]*width:\s*(\d+)px/)?.[1] ?? NaN);
      return Number.isFinite(width) && width === 240;
    })
    .toBe(true);
});

test('[P1] manual edit deck fit-scale move undo restores left/top in one step', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit deck fit move undo');
  const fileName = 'manual-deck-fit-move-undo.html';
  await seedDeckFitScaleArtifact(page, projectId, fileName);
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await waitForDeckFitScaleReady(frame);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="deck-move-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 56, startY + 28, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="deck-move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(\d+)px/)?.[1] ?? NaN);
      return left > 540 && top > 380;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="deck-move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(\d+)px/)?.[1] ?? NaN);
      return left === 520 && top === 360;
    })
    .toBe(true);
});

test('[P1] manual edit multi-select applies batch color and undo rolls back in one step', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit multi-select');
  const fileName = 'manual-edit-multi-select.html';
  await seedHtmlArtifact(page, projectId, fileName, manualEditHtml());
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.locator('[data-od-id="hero-title"]').click();
  await frame.locator('[data-od-id="cta"]').click({ modifiers: ['Shift'] });

  await expect(page.locator('.manual-edit-modal')).toContainText('2 selected');
  await expect(page.getByTestId('manual-edit-multi-select-overlay')).toBeVisible();
  await expect(page.getByTestId('manual-edit-resize-overlay')).toHaveCount(0);
  await expect(frame.locator('[data-od-id="hero-title"][data-od-edit-selected="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-od-id="cta"][data-od-edit-selected="true"]')).toHaveCount(1);

  await inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input').fill('#ef4444');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, fileName, [
    'data-od-id="hero-title"',
    'color:',
    'data-od-id="cta"',
  ]);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();
  await expect.poll(async () => {
    const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
    if (!resp.ok()) return false;
    const source = await resp.text();
    return !source.includes('color: #ef4444') && !source.includes('color:#ef4444');
  }).toBe(true);
});

test('[P1] manual edit multi-select group move applies same delta and undo rolls back in one step', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit group move');
  const fileName = 'manual-edit-group-move.html';
  await seedHtmlArtifact(page, projectId, fileName, manualEditHtml());
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.locator('[data-od-id="move-box"]').click();
  await frame.locator('[data-od-id="nested-abs-box"]').click({ modifiers: ['Shift'] });

  await expect(page.getByTestId('manual-edit-multi-select-overlay')).toBeVisible();
  await expect(page.getByTestId('manual-edit-multi-select-overlay')).toHaveAttribute('data-movable', 'true');

  const overlay = page.getByTestId('manual-edit-multi-select-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const moveStyle = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      const nestedStyle = source.match(/data-od-id="nested-abs-box"[^>]*style="([^"]*)"/)?.[1];
      if (!moveStyle || !nestedStyle) return false;
      const moveLeft = Number(moveStyle.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const moveTop = Number(moveStyle.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedLeft = Number(nestedStyle.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedTop = Number(nestedStyle.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return moveLeft >= 60 && moveTop >= 40 && nestedLeft >= 76 && nestedTop >= 36;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const moveStyle = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      const nestedStyle = source.match(/data-od-id="nested-abs-box"[^>]*style="([^"]*)"/)?.[1];
      if (!moveStyle || !nestedStyle) return false;
      const moveLeft = Number(moveStyle.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const moveTop = Number(moveStyle.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedLeft = Number(nestedStyle.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedTop = Number(nestedStyle.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return moveLeft === 24 && moveTop === 24 && nestedLeft === 40 && nestedTop === 20;
    })
    .toBe(true);
});

test('[P1] manual edit multi-select group resize scales both boxes and undo rolls back in one step', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit group resize');
  const fileName = 'manual-edit-group-resize.html';
  await seedHtmlArtifact(page, projectId, fileName, manualEditHtml());
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.locator('[data-od-id="move-box"]').click();
  await frame.locator('[data-od-id="nested-abs-box"]').click({ modifiers: ['Shift'] });

  const handle = page.getByTestId('manual-edit-multi-resize-handle-se');
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 48, box!.y + box!.height / 2 + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const moveStyle = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      const nestedStyle = source.match(/data-od-id="nested-abs-box"[^>]*style="([^"]*)"/)?.[1];
      if (!moveStyle || !nestedStyle) return false;
      const moveWidth = Number(moveStyle.match(/width:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedWidth = Number(nestedStyle.match(/width:\s*(-?\d+)px/)?.[1] ?? NaN);
      return moveWidth >= 160 && nestedWidth >= 115;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const moveStyle = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      const nestedStyle = source.match(/data-od-id="nested-abs-box"[^>]*style="([^"]*)"/)?.[1];
      if (!moveStyle || !nestedStyle) return false;
      const moveWidth = Number(moveStyle.match(/width:\s*(-?\d+)px/)?.[1] ?? NaN);
      const nestedWidth = Number(nestedStyle.match(/width:\s*(-?\d+)px/)?.[1] ?? NaN);
      return moveWidth === 140 && nestedWidth === 100;
    })
    .toBe(true);
});

test('[P1] manual edit layer list supports ctrl additive multi-select', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit layer mult');
  const fileName = 'manual-edit-layer-mult.html';
  await seedHtmlArtifact(page, projectId, fileName, manualEditHtml());
  await page.goto(`/projects/${projectId}/files/${fileName}`);
  await openDesignFile(page, fileName);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await page.getByTestId('manual-edit-layers-toggle').click();
  await expect(page.getByTestId('manual-edit-layers-panel')).toBeVisible();
  await page.getByTestId('manual-edit-layer-row-hero-title').click();
  await page.getByTestId('manual-edit-layer-row-cta').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('.manual-edit-modal')).toContainText('2 selected');
});

test('[P1] manual edit body-drag undo restores left/top in one step', async ({ page }) => {
  test.setTimeout(60_000);
  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Manual edit move undo');
  await seedHtmlArtifact(page, projectId, 'manual-edit-move-undo.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit-move-undo.html`);
  await openDesignFile(page, 'manual-edit-move-undo.html');

  const frame = artifactPreviewFrame(page);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="move-box"]', 'SIZE');

  const overlay = page.getByTestId('manual-edit-resize-overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 24, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return left >= 60 && top >= 40;
    })
    .toBe(true);

  const undo = page.getByTestId('file-viewer-undo');
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();

  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/manual-edit-move-undo.html`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      const style = source.match(/data-od-id="move-box"[^>]*style="([^"]*)"/)?.[1];
      if (!style) return false;
      const left = Number(style.match(/left:\s*(-?\d+)px/)?.[1] ?? NaN);
      const top = Number(style.match(/top:\s*(-?\d+)px/)?.[1] ?? NaN);
      return left === 24 && top === 24;
    })
    .toBe(true);
});

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

test('preview toolbar keeps share, download, comment, and zoom actions reachable', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Preview toolbar smoke');
  await seedHtmlArtifact(page, projectId, 'toolbar-preview.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/toolbar-preview.html`);
  await openDesignFile(page, 'toolbar-preview.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  await expect(
    page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Preview' }),
  ).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: /^Share$/ }).click();
  const shareMenu = page.locator('.share-menu-popover[role="menu"]');
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu).toContainText('PUBLISH ONLINE');
  await expect(shareMenu).toContainText('SOCIAL SHARE');
  await page.keyboard.press('Escape');
  await expect(shareMenu).toHaveCount(0);

  await page.getByRole('button', { name: /^Download$/ }).click();
  const downloadMenu = page.locator('.share-menu-popover[role="menu"]');
  await expect(downloadMenu).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Download as \.zip/ })).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Export as standalone HTML/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(downloadMenu).toHaveCount(0);

  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

  const zoomButton = page.locator('.viewer-toolbar-zoom .zoom-trigger');
  await expect(zoomButton).toHaveText('100%');
  await zoomButton.click();
  const zoomMenu = page.locator('.zoom-menu-popover[role="menu"]');
  await expect(zoomMenu).toBeVisible();
  await zoomMenu.getByRole('menuitem', { name: '150%' }).click();
  await expect(zoomButton).toHaveText('150%');
});

test('[P1] HTML preview toolbar exposes screenshot, comments, mark, and edit workflows', async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    class TestClipboardItem {
      constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {}
    }
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: TestClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async () => undefined,
        writeText: async () => undefined,
      },
    });
  });

  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Preview tools smoke');
  await seedHtmlArtifact(page, projectId, 'preview-tools.html', withSnapshotBridge(manualEditHtml()));
  const conversationId = await latestConversationId(page, projectId);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}/files/preview-tools.html`);
  await openDesignFile(page, 'preview-tools.html');

  await expect(artifactPreview(page)).toBeVisible();
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('screenshot-copy-button').click();
  await expect(
    page.getByText(/Screenshot copied to clipboard|Browser blocked clipboard access|Could not capture the preview|Preview is still loading/),
  ).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await artifactPreviewFrame(page).locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Panel-level comment');
  await page.getByTestId('comment-popover').getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();

  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await expect(page.getByTestId('comment-side-panel')).toContainText('Panel-level comment');
  await expect(page.getByTestId('comment-panel-toggle')).toContainText('1');
  await page.getByTestId('comment-panel-toggle').click();
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  await holdNextRunOpen(page);
  await sendPrompt(page, 'Keep the current preview run active');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByTestId('draw-overlay-toggle').click();
  await expect(page.getByTestId('draw-overlay-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Box select' })).toBeVisible();
  await page.getByPlaceholder('Add a note for this mark').fill('Mark this hero crop');
  await expect(page.getByRole('button', { name: 'Add to input' })).toBeEnabled();

  const previewBox = await artifactPreview(page).boundingBox();
  expect(previewBox).not.toBeNull();
  await page.mouse.move(previewBox!.x + 80, previewBox!.y + 80);
  await page.mouse.down();
  await page.mouse.move(previewBox!.x + 220, previewBox!.y + 170);
  await page.mouse.up();
  const queueButton = page.getByRole('button', { name: 'Queue' });
  await expect(queueButton).toBeEnabled();
  await queueButton.click();
  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('Mark this hero crop');
  await expect(queuedStrip).toContainText('1 mark');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await selectPreviewElementThroughBridge(page, artifactPreviewFrame(page), '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).toContainText('Hero title');
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();
});

async function selectStyleRowInput(
  page: Page,
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
  section: string,
  label: string,
) {
  await frame.locator(selector).evaluate((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    window.parent.postMessage({
      type: 'od-edit-select',
      target: {
        id: element.dataset.odId ?? element.id,
        kind: 'text',
        label: element.textContent?.trim() || element.tagName.toLowerCase(),
        tagName: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: element.textContent?.trim() ?? '',
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        fields: { text: element.textContent?.trim() ?? '' },
        attributes: Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value])),
        styles: {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          color: styles.color,
          textAlign: styles.textAlign,
          lineHeight: styles.lineHeight,
          letterSpacing: styles.letterSpacing,
          width: styles.width,
          height: styles.height,
          minHeight: styles.minHeight,
          gap: styles.gap,
          flexDirection: styles.flexDirection,
          justifyContent: styles.justifyContent,
          alignItems: styles.alignItems,
          backgroundColor: styles.backgroundColor,
          opacity: styles.opacity,
          padding: styles.padding,
          paddingTop: styles.paddingTop,
          paddingRight: styles.paddingRight,
          paddingBottom: styles.paddingBottom,
          paddingLeft: styles.paddingLeft,
          margin: styles.margin,
          marginTop: styles.marginTop,
          marginRight: styles.marginRight,
          marginBottom: styles.marginBottom,
          marginLeft: styles.marginLeft,
          border: styles.border,
          borderTopWidth: styles.borderTopWidth,
          borderRightWidth: styles.borderRightWidth,
          borderBottomWidth: styles.borderBottomWidth,
          borderLeftWidth: styles.borderLeftWidth,
          borderStyle: styles.borderStyle,
          borderColor: styles.borderColor,
          borderRadius: styles.borderRadius,
        },
        isLayoutContainer: false,
        outerHtml: element.outerHTML,
      },
    }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  const row = inspectorSection(page, section).locator('.cc-row').filter({ hasText: label }).locator('input');
  await expect(row).toBeVisible();
  return row;
}

test('[P0] manual edit mode keeps deck navigation available for deck-shaped HTML', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit deck smoke');
  await seedDeckArtifact(page, projectId, 'manual-deck.html', 'Manual Deck', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/manual-deck.html`);
  await openDesignFile(page, 'manual-deck.html');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
});


test('[P0] simple deck keeps the active slide stable across preview mode switches', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Simple deck navigation state');
  await seedDeckArtifact(page, projectId, 'simple-deck.html', 'Simple Deck', ['Slide One', 'Slide Two', 'Slide Three']);
  await page.goto(`/projects/${projectId}/files/simple-deck.html`);
  await openDesignFile(page, 'simple-deck.html');

  const frame = artifactPreviewFrame(page);
  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });

  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();

  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('Slide Three');
  await viewModeTabs.getByRole('tab', { name: 'Preview' }).click();

  await expect(frame.getByText('Slide Two')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Three')).toBeVisible();
});

test('[P0] @critical HTML preview stays rendered after switching from Preview to Code and back', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'HTML preview toggle regression');
  await seedHtmlArtifact(
    page,
    projectId,
    'toggle-preview.html',
    '<!doctype html><html><body><main><h1>Toggle Preview Stable</h1><p>Still visible after tab switches.</p></main></body></html>',
  );
  await page.goto(`/projects/${projectId}`);
  await openDesignFile(page, 'toggle-preview.html');

  const previewFrame = artifactPreview(page);
  await expect(previewFrame).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();

  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });
  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('Toggle Preview Stable');

  await viewModeTabs.getByRole('tab', { name: 'Preview' }).click();
  await expect(previewFrame).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByText('Still visible after tab switches.'),
  ).toBeVisible();
});

async function routeMockAgents(page: Page) {
  await routeAgents(page, [
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
}

async function createEmptyProject(page: Page, name: string): Promise<string> {
  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) throw new Error(`unexpected project route: ${current.pathname}`);
  return projectId;
}

/** Create a project without the entry-rail new-project control (hidden in Teamver embed/vite-dev). */
async function createProjectViaApi(page: Page, name: string): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const projectId = `manual-resize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
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
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function latestConversationId(page: Page, projectId: string): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/conversations`, { timeout: 15_000 });
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) throw new Error(`no conversations found for project ${projectId}`);
  return latest.id;
}

async function holdNextRunOpen(page: Page) {
  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `preview-tools-run-${runCount}` }),
    });
  });
  await page.route('**/api/runs/*/events', async () => {
    await new Promise(() => undefined);
  });
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: T.short });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt, { timeout: T.short });
  await expect(sendButton).toBeEnabled({ timeout: T.short });
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    sendButton.evaluate((button: HTMLButtonElement) => button.click()),
  ]);
}

function isCreateRunResponse(resp: { url(): string; request(): { method(): string } }): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/runs' && resp.request().method() === 'POST';
}

function withSnapshotBridge(html: string): string {
  const bridge = `
<script>
window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'od:snapshot') return;
  event.source?.postMessage({
    type: 'od:snapshot:result',
    id: data.id,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    w: 1,
    h: 1,
  }, '*');
});
</script>`;
  return html.replace('</body>', `${bridge}</body>`);
}

async function seedDeckArtifact(
  page: Page,
  projectId: string,
  fileName: string,
  title: string,
  slides: string[],
) {
  const slideHtml = slides
    .map((slide, index) => `<section class="slide" data-od-id="slide-${index + 1}"${index === 0 ? '' : ' hidden'}><h1>${slide}</h1></section>`)
    .join('\n');
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name: fileName,
        content: `<!doctype html><html><body>${slideHtml}</body></html>`,
        artifactManifest: {
          version: 1,
          kind: 'deck',
          title,
          entry: fileName,
          renderer: 'deck-html',
          exports: ['html', 'pptx'],
        },
      },
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function seedDeckFitScaleArtifact(page: Page, projectId: string, fileName: string) {
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name: fileName,
        content: manualEditDeckFitScaleHtml(),
        artifactManifest: {
          version: 1,
          kind: 'deck',
          title: 'Manual Edit Deck Fit Scale',
          entry: fileName,
          renderer: 'deck-html',
          exports: ['html', 'pptx'],
        },
      },
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function waitForDeckFitScaleReady(frame: ReturnType<Page['frameLocator']>) {
  await expect(frame.locator('html[data-od-compact-stacked]')).toHaveCount(1, { timeout: 20_000 });
  await expect(frame.locator('[data-od-id="deck-resize-box"]')).toBeVisible();
  await expect(frame.locator('[data-od-id="deck-move-box"]')).toBeVisible();
}

async function expectDeckFitScaleActive(
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
) {
  await expect.poll(async () => {
    const ratio = await frame.locator(selector).evaluate((el) => {
      const visual = el.getBoundingClientRect().width;
      const layout = Number.parseFloat(getComputedStyle(el).width);
      return layout > 0 ? visual / layout : 1;
    });
    return ratio < 0.85 && ratio > 0.2;
  }).toBe(true);
}

async function expectOverlayBoxStable(
  overlay: ReturnType<Page['getByTestId']>,
  expected: { width?: number; height?: number; x?: number; y?: number },
  tolerancePx = 8,
) {
  const assertNear = (actual: number, target: number) => Math.abs(actual - target) <= tolerancePx;
  await expect.poll(async () => {
    const box = await overlay.boundingBox();
    if (!box) return false;
    if (expected.width != null && !assertNear(box.width, expected.width)) return false;
    if (expected.height != null && !assertNear(box.height, expected.height)) return false;
    if (expected.x != null && !assertNear(box.x, expected.x)) return false;
    if (expected.y != null && !assertNear(box.y, expected.y)) return false;
    return true;
  }, { timeout: 3_000, intervals: [50, 100, 150, 200] }).toBe(true);
}

async function openDesignFile(page: Page, fileName: string) {
  const preview = artifactPreview(page);
  try {
    await preview.waitFor({ state: 'visible', timeout: 5_000 });
    return;
  } catch {
    // Not yet visible; try opening via tab or file list
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

function inspectorRow(page: Page, label: string) {
  return page.locator('.manual-edit-modal .cc-row').filter({ hasText: label }).first();
}

function inspectorSection(page: Page, title: string) {
  return page.locator('.manual-edit-modal .cc-section').filter({ hasText: title }).first();
}

function inspectSaveButton(page: Page) {
  return page.locator('.manual-edit-modal').getByRole('button', { name: /^Save$/ });
}

function manualEditHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Manual Edit</title>
    <style>
      .responsive-pair { display: flex; gap: 24px; }
      .responsive-pair > div { flex: 1 1 0; min-height: 40px; }
      @media (max-width: 700px) {
        .responsive-pair { flex-direction: column; }
      }
    </style>
  </head>
  <body style="font-family: Inter, system-ui, sans-serif; font-size: 16px; letter-spacing: 0.01em;">
    <main>
      <section data-od-id="responsive-pair" data-od-label="Responsive pair" class="responsive-pair">
        <div data-od-id="pair-a">Left panel</div>
        <div data-od-id="pair-b">Right panel</div>
      </section>
      <section data-od-id="hero" data-od-label="Hero section" style="display:flex;gap:8px;align-items:center;">
        <h1 data-od-id="hero-title" data-od-label="Hero title">Original Hero</h1>
        <a data-od-id="cta" data-od-label="Primary CTA" href="/start">Start now</a>
        <img data-od-id="hero-image" data-od-label="Hero image" src="/hero.png" alt="Hero" style="width:64px;height:64px;">
      </section>
      <div data-od-id="resize-box" data-od-label="Resize box" style="width:120px;height:80px;background:#d4d4d8;">Resize me</div>
      <div data-od-id="move-box" data-od-label="Move box" style="position:absolute;left:24px;top:24px;width:140px;height:90px;background:#93c5fd;">Move me</div>
      <div data-od-id="relative-host" data-od-label="Relative host" style="position:relative;width:280px;height:140px;margin-top:120px;border:1px solid #e5e5e5;">
        <div data-od-id="relative-box" data-od-label="Relative box" style="position:relative;left:10px;top:8px;margin-left:40px;width:100px;height:60px;background:#fca5a5;">Relative</div>
        <div data-od-id="nested-abs-box" data-od-label="Nested abs" style="position:absolute;left:40px;top:20px;width:100px;height:60px;background:#86efac;">Nested abs</div>
      </div>
    </main>
  </body>
</html>`;
}

function manualEditDeckFitScaleHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <style>
    body { margin: 0; background: #0f172a; }
    .slide {
      width: 1920px;
      height: 1080px;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      color: #fff;
      padding: 48px;
    }
  </style>
</head>
<body>
  <section class="slide" data-od-id="slide-1">
    <h1>Deck fit-scale</h1>
    <div data-od-id="deck-resize-box" data-od-label="Deck resize box"
      style="position:absolute;left:200px;top:200px;width:240px;height:120px;background:#93c5fd;">
      Resize
    </div>
    <div data-od-id="deck-move-box" data-od-label="Deck move box"
      style="position:absolute;left:520px;top:360px;width:200px;height:100px;background:#fca5a5;">
      Move
    </div>
  </section>
</body>
</html>`;
}

function deckHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <section class="slide" data-od-id="slide-1"><h1>Slide One</h1></section>
    <section class="slide" data-od-id="slide-2" hidden><h1>Slide Two</h1></section>
    <script>
      let active = 0;
      const slides = Array.from(document.querySelectorAll('.slide'));
      function render() { slides.forEach((slide, index) => { slide.hidden = index !== active; }); }
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'od:slide') return;
        if (event.data.action === 'next') active = Math.min(slides.length - 1, active + 1);
        if (event.data.action === 'prev') active = Math.max(0, active - 1);
        render();
        window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
      });
      render();
      window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
    </script>
  </body>
</html>`;
}
