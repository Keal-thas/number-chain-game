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

// ─── Merge / eviction ─────────────────────────────────────
test.describe('merge', () => {
  test('extending into adjacent chain endpoint evicts it and reaches 100%', async ({ page }) => {
    await loadPuzzle(page, MERGE_CSV);
    // Chain A: 1@(0,0) → 2@(0,1) ascending
    await dragPath(page, [[0, 0], [0, 1]]);
    // Chain B: 4@(0,3) → 3@(0,2) descending
    await page.locator('#btn-desc').click();
    await dragPath(page, [[0, 3], [0, 2]]);
    // Extend chain A into (0,2): evicts value-3 from chain B, all 4 cells covered
    await page.locator('#btn-asc').click();
    await dragPath(page, [[0, 1], [0, 2]]);
    await expect(page.locator('#progress')).toContainText('100%');
  });
});

// ─── Value eviction ───────────────────────────────────────
test.describe('value eviction', () => {
  test('dragging from middle cell splits chain: after-fragment stays', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Single-click on middle cell (0,1)=2: splits into [1] and [3], active cell not saved
    await dragPath(page, [[0, 1]]);
    // After-fragment [3 at (0,2)] must still be filled
    await expect(cell(page, 0, 2)).toHaveClass(/cell-filled/);
    await expect(cell(page, 0, 2)).toHaveText('3');
    // Before-fragment [1 at (0,0)] is fixed, still shows
    await expect(cell(page, 0, 0)).toHaveText('1');
    // Middle cell (0,1) is no longer in any chain
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
  });

  test('new path evicts old cell with same value', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Drag from middle (0,1)=2 to new cell (1,1) → generates new val=3
    // evictValue(3) must remove old 3 at (0,2)
    await dragPath(page, [[0, 1], [1, 1]]);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 1, 1)).toHaveText('3');
  });

  test('eviction of middle cell in after-fragment splits it', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1]]);
    // Click middle (0,1)=2: splits into before=[1], after=[3,4,5], active at 2
    // Drag from (0,1) → (1,0) generates val=3 → evicts 3 at (0,2) from after-fragment
    // after-fragment becomes [4(1,2), 5(1,1)] — split further? no, (0,2) was first cell
    await dragPath(page, [[0, 1], [1, 0]]);
    // (0,2) was evicted (first of after-fragment) → after-fragment becomes [4,5]
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    // (1,2)=4 and (1,1)=5 survive as the remaining after-fragment
    await expect(cell(page, 1, 2)).toHaveText('4');
    await expect(cell(page, 1, 1)).toHaveText('5');
  });

  test('old value 6 stays when new chain only reaches 5', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)→6(1,0)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    // From middle (0,1)=2, drag new path generating 3,4,5 only
    // New path: (0,1)→(1,1)? No, (1,1) will be in after-fragment with val=5
    // Use: (0,1)→(2,1)? (2,1) val=3, (2,0)=4, but need to avoid conflicting fixed 9
    // Simpler: drag (0,1)→(1,1) evicts old 5, then release — old 6 at (1,0) stays
    await dragPath(page, [[0, 1], [1, 1]]);
    // (1,0)=6 was not reached by new chain → not evicted
    await expect(cell(page, 1, 0)).toHaveText('6');
    await expect(cell(page, 1, 0)).toHaveClass(/cell-filled/);
  });
});
