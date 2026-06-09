const { test, expect } = require('@playwright/test');

async function openGenerator(page, { rows = 5, cols = 5, blocked = 0, fixed = 4 } = {}) {
  await page.goto('/generator.html');
  await page.locator('#p-rows').fill(String(rows));
  await page.locator('#p-cols').fill(String(cols));
  await page.locator('#p-blocked').fill(String(blocked));
  await page.locator('#p-fixed').fill(String(fixed));
  await page.locator('.btn-generate').click();
  await page.locator('#result').waitFor({ state: 'visible' });
}

function countCsvToken(csv, token) {
  return csv.split('\n').slice(1).join(',').split(',')
    .filter(v => v.trim() === token).length;
}

function countFixedCells(csv) {
  return csv.split('\n').slice(1).join(',').split(',')
    .filter(v => { const n = parseInt(v); return !isNaN(n) && n > 0; }).length;
}

// ─── Generator page ───────────────────────────────────────
test.describe('generator page', () => {
  test('loads with form elements visible and result hidden', async ({ page }) => {
    await page.goto('/generator.html');
    await expect(page.locator('#p-rows')).toBeVisible();
    await expect(page.locator('#p-cols')).toBeVisible();
    await expect(page.locator('#p-blocked')).toBeVisible();
    await expect(page.locator('#p-fixed')).toBeVisible();
    await expect(page.locator('.btn-generate')).toBeVisible();
    await expect(page.locator('#result')).toBeHidden();
  });

  test('generate shows preview cells and CSV', async ({ page }) => {
    await openGenerator(page, { rows: 4, cols: 4, blocked: 0, fixed: 3 });
    await expect(page.locator('#preview .g-cell')).toHaveCount(16);
    const csv = await page.locator('#csv-area').inputValue();
    expect(csv.trim()).toMatch(/^4,4/);
  });

  test('generated CSV dimensions match params', async ({ page }) => {
    await openGenerator(page, { rows: 3, cols: 5, blocked: 0, fixed: 2 });
    const csv = await page.locator('#csv-area').inputValue();
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('3,5');
    expect(lines.length).toBe(4);          // header + 3 rows
    expect(lines[1].split(',').length).toBe(5);
  });

  test('generated CSV has correct fixed cell count', async ({ page }) => {
    await openGenerator(page, { rows: 4, cols: 4, blocked: 0, fixed: 5 });
    const csv = await page.locator('#csv-area').inputValue();
    expect(countFixedCells(csv)).toBe(5);
  });

  test('generated CSV has correct blocked cell count', async ({ page }) => {
    await openGenerator(page, { rows: 4, cols: 4, blocked: 3, fixed: 2 });
    const csv = await page.locator('#csv-area').inputValue();
    expect(countCsvToken(csv, 'X')).toBe(3);
  });

  test('show solution reveals all path values', async ({ page }) => {
    await openGenerator(page, { rows: 3, cols: 3, blocked: 0, fixed: 2 });
    const emptyBefore = await page.locator('#preview .g-empty').count();
    expect(emptyBefore).toBeGreaterThan(0);

    await page.locator('#btn-solution').click();
    await expect(page.locator('#preview .g-empty')).toHaveCount(0);

    await page.locator('#btn-solution').click();
    await expect(page.locator('#preview .g-empty')).toHaveCount(emptyBefore);
  });

  test('regenerate produces valid result', async ({ page }) => {
    await openGenerator(page, { rows: 4, cols: 4, blocked: 0, fixed: 3 });
    await page.locator('.btn-regen').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    const csv = await page.locator('#csv-area').inputValue();
    expect(csv.trim()).toMatch(/^4,4/);
    expect(countFixedCells(csv)).toBe(3);
  });
});

// ─── Strategy: Random DFS ────────────────────────────────
test.describe('random DFS strategy', () => {
  test('generates valid CSV with correct dimensions', async ({ page }) => {
    await page.goto('/generator.html');
    await page.locator('#p-rows').fill('4');
    await page.locator('#p-cols').fill('4');
    await page.locator('#p-blocked').fill('0');
    await page.locator('#p-fixed').fill('3');
    await page.locator('input[name="strategy"][value="random_dfs"]').check();
    await page.locator('.btn-generate').click();
    await page.locator('#result').waitFor({ state: 'visible' });

    const csv = await page.locator('#csv-area').inputValue();
    expect(csv.trim()).toMatch(/^4,4/);
    expect(countFixedCells(csv)).toBe(3);
  });

  test('strategy radio buttons are rendered from STRATEGIES array', async ({ page }) => {
    await page.goto('/generator.html');
    const radios = page.locator('input[name="strategy"]');
    await expect(radios).toHaveCount(2);
    await expect(page.locator('input[name="strategy"][value="warnsdorff"]')).toBeChecked();
    await expect(page.locator('input[name="strategy"][value="random_dfs"]')).not.toBeChecked();
  });
});

// ─── Generator → game integration ────────────────────────
test.describe('generator → game', () => {
  test('URL param ?csv= auto-loads puzzle in game', async ({ page }) => {
    const csv = '3,3\n1,0,0\n0,0,0\n0,0,9';
    await page.goto(`/?csv=${encodeURIComponent(csv)}`);
    await page.locator('.cell').first().waitFor();
    await expect(page.locator('.cell')).toHaveCount(9);
    await expect(page.locator('[data-r="0"][data-c="0"]')).toHaveText('1');
    await expect(page.locator('[data-r="2"][data-c="2"]')).toHaveText('9');
  });
});
