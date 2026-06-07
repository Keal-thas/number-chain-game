const { test, expect } = require('@playwright/test');

// 3x3, 9 cells, fixed: 1@(0,0) and 9@(2,2)
const SIMPLE_CSV = '3,3\n1,0,0\n0,0,0\n0,0,9';

// 1x4, 4 cells, fixed: 1@(0,0) and 4@(0,3) — used for merge test
const MERGE_CSV = '1,4\n1,0,0,4';

async function loadPuzzle(page, csv = SIMPLE_CSV) {
  await page.goto('/');
  await page.locator('#csv-input').fill(csv);
  await page.locator('.btn-load').click();
  await page.locator('.cell').first().waitFor();
}

function cell(page, r, c) {
  return page.locator(`[data-r="${r}"][data-c="${c}"]`);
}

// Simulate a pointer drag through a sequence of [r, c] cell coordinates.
async function dragPath(page, coords) {
  const centers = [];
  for (const [r, c] of coords) {
    const box = await cell(page, r, c).boundingBox();
    centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await page.mouse.move(centers[0].x, centers[0].y);
  await page.mouse.down();
  for (let i = 1; i < centers.length; i++) {
    await page.mouse.move(centers[i].x, centers[i].y);
  }
  await page.mouse.up();
}

// ─── Loading ──────────────────────────────────────────────
test.describe('loading', () => {
  test('renders correct number of cells', async ({ page }) => {
    await loadPuzzle(page);
    await expect(page.locator('.cell')).toHaveCount(9);
  });

  test('fixed cells show their values', async ({ page }) => {
    await loadPuzzle(page);
    await expect(cell(page, 0, 0)).toHaveText('1');
    await expect(cell(page, 2, 2)).toHaveText('9');
  });

  test('fixed cells count toward initial progress', async ({ page }) => {
    await loadPuzzle(page);
    // 2 fixed cells filled out of 9 total
    await expect(page.locator('#progress')).toContainText('2 / 9');
  });
});

// ─── Drag ─────────────────────────────────────────────────
test.describe('drag', () => {
  test('creates ascending chain from fixed cell', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1]]);
    await expect(cell(page, 0, 1)).toHaveText('2');
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);
  });

  test('progress updates after drag', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // 2 fixed + 2 newly filled = 4
    await expect(page.locator('#progress')).toContainText('4 / 9');
  });

  test('back-drag removes last cell', async ({ page }) => {
    await loadPuzzle(page);
    // Drag forward to (0,1) then back to (0,0) before releasing
    await dragPath(page, [[0, 0], [0, 1], [0, 0]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
  });

  test('extends chain from existing endpoint', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1]]);
    await dragPath(page, [[0, 1], [0, 2]]);
    await expect(cell(page, 0, 2)).toHaveText('3');
  });

  test('descending mode assigns values correctly', async ({ page }) => {
    await loadPuzzle(page);
    await page.locator('#btn-desc').click();
    await dragPath(page, [[2, 2], [2, 1]]);
    await expect(cell(page, 2, 1)).toHaveText('8');
  });

  test('shows message when dragging into mismatched fixed cell', async ({ page }) => {
    await loadPuzzle(page, '3,3\n1,0,5\n0,0,0\n0,0,9');
    // Fixed 5 is at (0,2); dragging from 1→(0,1)→(0,2) expects value 3, not 5
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await expect(page.locator('#message')).toContainText('值不匹配');
  });
});

// ─── Erase ────────────────────────────────────────────────
test.describe('erase', () => {
  test('removes endpoint cell', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await page.locator('#btn-erase').click();
    await cell(page, 0, 2).click();
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);
  });

  test('splits chain at middle cell', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await page.locator('#btn-erase').click();
    await cell(page, 0, 1).click();
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
    // (0,2) survives as its own 1-cell chain
    await expect(cell(page, 0, 2)).toHaveClass(/cell-filled/);
  });
});

// ─── Unique path ──────────────────────────────────────────
test.describe('unique path', () => {
  test('marks chain with unique class when mode is on', async ({ page }) => {
    await loadPuzzle(page);
    await page.locator('#btn-unique').click();
    await dragPath(page, [[0, 0], [0, 1]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-unique/);
  });
});

// ─── Reset ────────────────────────────────────────────────
test.describe('reset', () => {
  test('clears all filled cells', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await page.locator('.btn-reset').click();
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
  });

  test('restores initial progress', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await page.locator('.btn-reset').click();
    await expect(page.locator('#progress')).toContainText('2 / 9');
  });
});

// ─── Merge ────────────────────────────────────────────────
test.describe('merge', () => {
  test('connecting two adjacent chain endpoints merges them', async ({ page }) => {
    await loadPuzzle(page, MERGE_CSV);
    // Chain A: 1@(0,0) → 2@(0,1) ascending
    await dragPath(page, [[0, 0], [0, 1]]);
    // Chain B: 4@(0,3) → 3@(0,2) descending
    await page.locator('#btn-desc').click();
    await dragPath(page, [[0, 3], [0, 2]]);
    // Merge: drag chain A's endpoint (0,1)=2 into chain B's endpoint (0,2)=3
    await page.locator('#btn-asc').click();
    await dragPath(page, [[0, 1], [0, 2]]);
    // All 4 cells covered → 100% complete
    await expect(page.locator('#progress')).toContainText('100%');
  });
});
