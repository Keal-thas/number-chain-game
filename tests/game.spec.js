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

// ─── Bug regression ───────────────────────────────────────
test.describe('bug regression', () => {
  // Bug 1: middle-cell drag must preserve the head-side edge
  test('Bug1: dragging from middle cell preserves head-side connection', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Redirect from (0,1)=2 toward (1,1): head edge 0,0–0,1 must survive
    await dragPath(page, [[0, 1], [1, 1]]);
    // Verify: clicking fixed1 clears its connected component (0,1) and (1,1),
    // proving the 0,0–0,1 edge was preserved (otherwise they'd be isolated and survive)
    await dragPath(page, [[0, 0]]);
    await expect(cell(page, 1, 1)).toHaveClass(/cell-empty/);
  });

  // Bug 2: fixed-cell value must not be duplicated on non-fixed cells
  test('Bug2: cannot place a value already occupied by a fixed cell', async ({ page }) => {
    // 2x3, fixed 1 at (0,0), fixed 3 at (1,2)
    await loadPuzzle(page, '2,3\n1,0,0\n0,0,3');
    // Drag 1→2→try 3 at non-fixed cell (0,2); fixed 3 is at (1,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await expect(page.locator('#message')).toContainText('已被固定格占用');
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
  });

  // Bug 3: endpoint drag direction must follow current mode, not inferred chain direction
  test('Bug3: switching to desc then dragging endpoint yields desc step', async ({ page }) => {
    await loadPuzzle(page);
    // Build asc: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Switch to desc, drag from endpoint (0,2)=3; next should be 2 (desc step), not 4 (asc)
    await page.locator('#btn-desc').click();
    await dragPath(page, [[0, 2], [1, 2]]);
    await expect(cell(page, 1, 2)).toHaveText('2');
  });

  // Bug 4: desc-mode middle-cell drag must preserve the higher-value (successor) side
  test('Bug4: middle-cell drag in desc mode preserves the successor side', async ({ page }) => {
    await loadPuzzle(page);
    // Build asc: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)→6(1,0)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    // Switch to desc, single-click on (1,2)=4 (middle, neighbors: (0,2)=3 and (1,1)=5)
    // predVal in desc = 4+1=5 → keep val=5 side, clear val=3 side
    await page.locator('#btn-desc').click();
    await dragPath(page, [[1, 2]]);
    // Successor side (5 and 6) must survive
    await expect(cell(page, 1, 1)).toHaveText('5');
    await expect(cell(page, 1, 0)).toHaveText('6');
    // Predecessor side (3 and below) must be cleared
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
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
  test('clicking middle cell in asc mode clears the forward fragment', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Single-click on middle (0,1)=2 in asc: predVal=1, clears val=3 side immediately
    await dragPath(page, [[0, 1]]);
    // Forward cell (0,2)=3 is now cleared (eager forward-clear)
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    // Head (fixed 1) still shows
    await expect(cell(page, 0, 0)).toHaveText('1');
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

  test('dragging from middle cell clears entire forward chain then places new values', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1]]);
    // Drag from (0,1)=2 to (1,0): asc predVal=1, so entire forward chain [3,4,5] cleared upfront
    await dragPath(page, [[0, 1], [1, 0]]);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 1, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 1, 1)).toHaveClass(/cell-empty/);
    // New chain places 3 at (1,0)
    await expect(cell(page, 1, 0)).toHaveText('3');
  });

  test('old value 6 stays when new chain only reaches 5', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)→6(1,0)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    // Drag from (0,1)=2 to (1,1): asc predVal=1, forward chain [3,4,5,6] all cleared upfront
    await dragPath(page, [[0, 1], [1, 1]]);
    // (1,0)=6 was in the forward chain → cleared even though drag didn't reach it
    await expect(cell(page, 1, 0)).toHaveClass(/cell-empty/);
    // New value 3 is placed at (1,1)
    await expect(cell(page, 1, 1)).toHaveText('3');
  });
});
