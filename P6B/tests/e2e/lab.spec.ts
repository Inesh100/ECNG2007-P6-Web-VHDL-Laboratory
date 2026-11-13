// E2E: full browser checks against the built site (P6-AC2.1, P6-AC2.2).
import { expect, test } from '@playwright/test';

// Skip the first-visit welcome tour in tests.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('p6b.welcomeSeen', '1'));
});

test('E2E-01 reference case runs and the reference waveform opens in Surfer', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('case-select').selectOption('HDL-01');
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('result-status')).toHaveText('Succeeded', { timeout: 15_000 });
  // Built-in quick view shows the signals...
  await expect(page.getByTestId('wave-view')).toContainText('count_r');
  // ...and Surfer itself confirms the VCD was parsed.
  await page.getByTestId('tab-surfer').click();
  await expect(page.getByTestId('surfer-state')).toHaveText('Waveform open in Surfer', { timeout: 60_000 });
  await expect(page.frameLocator('[data-testid=surfer-frame]').locator('canvas')).toBeVisible();
  const loaded = await page.evaluate(() => (document.querySelector('[data-testid=surfer-frame]') as HTMLIFrameElement).contentWindow?.['__surferLoaded' as never]);
  expect(loaded).toBe(true);
});

for (const [caseId, label] of [
  ['HDL-02', 'Analysis failure'],
  ['HDL-04', 'Elaboration failure'],
  ['HDL-06', 'Simulation failure'],
  ['HDL-07', 'Service/runtime failure'],
] as const) {
  test(`E2E-02 ${caseId} shows "${label}" and keeps the waveform disabled`, async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('case-select').selectOption(caseId);
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('failure-category')).toHaveText(label, { timeout: 15_000 });
    await expect(page.getByTestId('tab-waveform')).toBeDisabled();
    await expect(page.getByTestId('tab-surfer')).toBeDisabled();
  });
}

test('E2E-03 launch/result harness passes all published examples without Project 7', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('./harness.html');
  await page.getByTestId('run-all').click();
  await expect(page.getByTestId('harness-score')).toHaveText('4/4 passed', { timeout: 200_000 });
});

test('E2E-04 output pops out into its own window, re-runs from there, and docks back', async ({ page, context }) => {
  await page.goto('./');
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('result-status')).toBeVisible({ timeout: 15_000 });

  const [popout] = await Promise.all([context.waitForEvent('page'), page.getByTestId('popout-button').click()]);
  await expect(popout.getByTestId('result-status')).toHaveText('Succeeded', { timeout: 10_000 });
  await expect(page.getByTestId('popped-note')).toBeVisible();

  // Edit-free re-run from the pop-out goes through the main page.
  await popout.getByTestId('rerun-button').click();
  await expect(popout.getByText('Runs (2)')).toBeVisible({ timeout: 15_000 });

  // Clicking a problem in the pop-out highlights the line in the main window.
  await page.getByTestId('case-select').selectOption('HDL-02');
  await page.getByTestId('run-button').click();
  await expect(popout.getByTestId('failure-category')).toHaveText('Analysis failure', { timeout: 15_000 });
  await popout.locator('.problem').first().click();
  await expect(page.locator('.code-line.hl')).toContainText('count_r <= count_r + 1');

  await popout.getByTestId('dock-button').click();
  await expect(page.getByTestId('tab-console')).toBeVisible({ timeout: 5_000 });
});
