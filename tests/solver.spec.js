const { test, expect } = require('@playwright/test');

async function loadGame(page, csv) {
  await page.goto('/');
  await page.locator('#csv-input').fill(csv);
  await page.locator('.btn-load').click();
  await page.locator('.cell').first().waitFor();
}

// ─── Solver: answer display ───────────────────────────────
test.describe('solver', () => {
  test('show answer button exists after loading puzzle', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    await expect(page.locator('#btn-answer')).toBeVisible();
    await expect(page.locator('#btn-answer')).toHaveText('显示答案: 关');
  });

  test('clicking show answer fills empty cells with answer values', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    await expect(page.locator('.cell-answer')).toHaveCount(0);

    await page.locator('#btn-answer').click();
    // 9 cells total, 2 fixed → 7 answer cells
    await expect(page.locator('.cell-answer')).toHaveCount(7);
    await expect(page.locator('#btn-answer')).toHaveText('显示答案: 开');
  });

  test('answer cells show numeric values', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    await page.locator('#btn-answer').click();
    const cells = page.locator('.cell-answer');
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const text = await cells.nth(i).textContent();
      expect(Number(text)).toBeGreaterThanOrEqual(1);
      expect(Number(text)).toBeLessThanOrEqual(9);
    }
  });

  test('toggling answer off hides answer cells', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    await page.locator('#btn-answer').click();
    await expect(page.locator('.cell-answer')).not.toHaveCount(0);

    await page.locator('#btn-answer').click();
    await expect(page.locator('.cell-answer')).toHaveCount(0);
    await expect(page.locator('#btn-answer')).toHaveText('显示答案: 关');
  });

  test('user-filled cells are not replaced by answer display', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    // Fill (0,1) with value 2 by dragging from fixed cell (0,0)
    const c00 = page.locator('[data-r="0"][data-c="0"]');
    const c01 = page.locator('[data-r="0"][data-c="1"]');
    const box0 = await c00.boundingBox();
    const box1 = await c01.boundingBox();
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
    await page.mouse.down();
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.up();

    await page.locator('#btn-answer').click();
    // (0,1) should be cell-filled, not cell-answer
    await expect(c01).toHaveClass(/cell-filled/);
    await expect(c01).not.toHaveClass(/cell-answer/);
  });

  test('reset clears answer mode', async ({ page }) => {
    await loadGame(page, '3,3\n1,0,0\n0,0,0\n0,0,9');
    await page.locator('#btn-answer').click();
    await expect(page.locator('.cell-answer')).not.toHaveCount(0);

    await page.locator('.btn-reset').click();
    await expect(page.locator('.cell-answer')).toHaveCount(0);
    await expect(page.locator('#btn-answer')).toHaveText('显示答案: 关');
  });

  test('works with blocked cells', async ({ page }) => {
    // 3x3 with one blocked cell (X), totalCells = 8
    await loadGame(page, '3,3\n1,X,0\n0,0,0\n0,0,8');
    await page.locator('#btn-answer').click();
    // 8 cells total, 2 fixed, 1 blocked → 6 answer cells
    await expect(page.locator('.cell-answer')).toHaveCount(6);
  });
});
