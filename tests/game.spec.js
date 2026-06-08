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

// ─── Lock mode ────────────────────────────────────────────
test.describe('lock mode', () => {
  test('marks chain with locked class when mode is on', async ({ page }) => {
    await loadPuzzle(page);
    await page.locator('#btn-lock').click();
    await dragPath(page, [[0, 0], [0, 1]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-locked/);
  });

  test('drag cannot overwrite a locked cell', async ({ page }) => {
    await loadPuzzle(page);
    // Draw locked chain: (0,0)=1 → (0,1)=2
    await page.locator('#btn-lock').click();
    await dragPath(page, [[0, 0], [0, 1]]);
    await page.locator('#btn-lock').click(); // turn off lock mode

    // Try to overwrite (0,1) with a new drag from fixed cell (2,2)=9 descending
    await page.locator('#btn-desc').click();
    await dragPath(page, [[2, 2], [2, 1], [1, 1], [1, 0], [0, 0]]);
    // (0,1) holds value 2 and is locked — drag reaching value 2 should be blocked
    await expect(cell(page, 0, 1)).toHaveClass(/cell-locked/);
  });

  test('drag can overwrite a normal (non-locked) cell', async ({ page }) => {
    await loadPuzzle(page);
    // Draw normal chain: (0,0)=1 → (0,1)=2 → (0,2)=3
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);

    // New drag from (0,0) going different direction overwrites (0,1)
    await dragPath(page, [[0, 0], [1, 0], [1, 1]]);
    // (0,1) should now be empty (evicted) since it held value 2 which was re-used
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
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
  // Bug 1: middle-cell drag must preserve the head-side connection
  test('Bug1: dragging from middle cell preserves head-side connection', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Redirect from (0,1)=2 toward (1,1): evicts old 3 at (0,2), places new 3 at (1,1)
    await dragPath(page, [[0, 1], [1, 1]]);
    // Head side 0,0→0,1 preserved; old tail 0,2 cleared by eviction; new tail 1,1 filled
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 1, 1)).toHaveClass(/cell-filled/);
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

  // Bug 4: desc-mode middle-cell drag must preserve the higher-value (predecessor) side
  test('Bug4: desc drag from middle cell preserves higher-value side, evicts lower lazily', async ({ page }) => {
    await loadPuzzle(page);
    // Build asc: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)→6(1,0)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    // Switch to desc, drag from (1,2)=4 to (2,2) to place new val=3
    // predVal = 4+1=5 → edge to (1,1)=5 preserved, edge to (0,2)=3 disconnected
    await page.locator('#btn-desc').click();
    await dragPath(page, [[1, 2], [2, 1]]);  // (2,1) is an empty cell adjacent to (1,2)
    // Higher-value side (5 and 6) must survive
    await expect(cell(page, 1, 1)).toHaveText('5');
    await expect(cell(page, 1, 0)).toHaveText('6');
    // New val=3 placed at (2,1)
    await expect(cell(page, 2, 1)).toHaveText('3');
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

// ─── Value-only semantics ─────────────────────────────────
test.describe('value-only semantics', () => {
  test('re-dragging from fixed cell does not cascade into value-adjacent chain', async ({ page }) => {
    await loadPuzzle(page, MERGE_CSV);
    // Chain A: 1→2
    await dragPath(page, [[0, 0], [0, 1]]);
    // Chain B (desc): 4→3 — (0,1)=2 and (0,2)=3 are adjacent with consecutive values
    await page.locator('#btn-desc').click();
    await dragPath(page, [[0, 3], [0, 2]]);
    // Re-drag from fixed-1 (tap only): must NOT cascade — both chains stay intact
    await page.locator('#btn-asc').click();
    await dragPath(page, [[0, 0]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/); // chain A intact
    await expect(cell(page, 0, 2)).toHaveClass(/cell-filled/); // chain B intact
  });

  test('erasing a cell creates a value gap, non-adjacent cells survive re-drag', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1]]);
    // Erase value 3 — creates a gap between 2 and 4
    await page.locator('#btn-erase').click();
    await cell(page, 0, 2).click();
    await page.locator('#btn-erase').click();
    // 3 is gone; 4 and 5 survive disconnected from the fixed anchor
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);
    await expect(cell(page, 1, 2)).toHaveClass(/cell-filled/);
    await expect(cell(page, 1, 1)).toHaveClass(/cell-filled/);
    // Re-drag from fixed-1 (tap only): no eager clear — 2 stays
    await dragPath(page, [[0, 0]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);
  });

  test('erase mode ignores fixed cells', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 0], [0, 1]]); // build 1→2
    await page.locator('#btn-erase').click();
    await cell(page, 0, 0).click(); // click fixed cell — should be no-op
    await expect(cell(page, 0, 0)).toHaveClass(/cell-fixed/);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/); // connection survives
  });
});

// ─── Blocked cells ────────────────────────────────────────
test.describe('blocked cells', () => {
  // 2×2: fixed 1@(0,0), blocked@(0,1), empty (1,0) and (1,1). totalCells=3.
  const BLOCKED_CSV = '2,2\n1,X\n0,0';

  test('drag cannot extend into a blocked cell', async ({ page }) => {
    await loadPuzzle(page, BLOCKED_CSV);
    await dragPath(page, [[0, 0], [0, 1]]); // (0,1) is blocked
    await expect(cell(page, 0, 1)).toHaveClass(/cell-blocked/);
    await expect(page.locator('#progress')).toContainText('1 / 3');
  });

  test('erase mode ignores blocked cells', async ({ page }) => {
    await loadPuzzle(page, BLOCKED_CSV);
    await page.locator('#btn-erase').click();
    await cell(page, 0, 1).click();
    await expect(cell(page, 0, 1)).toHaveClass(/cell-blocked/);
  });
});

// ─── Messages ─────────────────────────────────────────────
test.describe('messages', () => {
  test('clicking empty cell shows prompt', async ({ page }) => {
    await loadPuzzle(page);
    await dragPath(page, [[0, 1]]); // empty cell
    await expect(page.locator('#message')).toContainText('请点击');
  });

  test('shows message when descending below minimum value 1', async ({ page }) => {
    await loadPuzzle(page, '1,3\n1,0,0');
    await page.locator('#btn-desc').click();
    await dragPath(page, [[0, 0], [0, 1]]); // fixed 1, desc → tries value 0
    await expect(page.locator('#message')).toContainText('最小值');
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);
  });

  test('shows completion message when all cells filled', async ({ page }) => {
    await loadPuzzle(page, MERGE_CSV); // 4 cells
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [0, 3]]); // 1→2→3→4
    await expect(page.locator('#progress')).toContainText('完成');
  });
});

// ─── Value eviction ───────────────────────────────────────
test.describe('value eviction', () => {
  test('re-dragging from fixed cell leaves chain intact; lazy eviction clears on extend', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)
    await dragPath(page, [[0, 0], [0, 1], [0, 2]]);
    // Tap fixed-1 without extending: chain stays
    await dragPath(page, [[0, 0]]);
    await expect(cell(page, 0, 1)).toHaveClass(/cell-filled/);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-filled/);
    // Extend in a new direction: evicts old values lazily as drag reaches them
    await dragPath(page, [[0, 0], [1, 0], [1, 1]]);
    await expect(cell(page, 1, 0)).toHaveClass(/cell-filled/); // new 2
    await expect(cell(page, 0, 1)).toHaveClass(/cell-empty/);  // old 2 evicted
    await expect(cell(page, 1, 1)).toHaveClass(/cell-filled/); // new 3
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/);  // old 3 evicted
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

  test('dragging from middle cell lazily evicts only the values the drag reaches', async ({ page }) => {
    await loadPuzzle(page);
    // Build chain: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1]]);
    // Drag from (0,1)=2 to (1,0): edge 2-3 disconnected; drag reaches val=3 → evicts old 3
    await dragPath(page, [[0, 1], [1, 0]]);
    await expect(cell(page, 0, 2)).toHaveClass(/cell-empty/); // old 3 evicted by drag
    await expect(cell(page, 1, 2)).toHaveText('4');           // 4 not reached → stays
    await expect(cell(page, 1, 1)).toHaveText('5');           // 5 not reached → stays
    await expect(cell(page, 1, 0)).toHaveText('3');           // new 3 placed
  });

  test('old value 6 stays when new chain only reaches 5', async ({ page }) => {
    await loadPuzzle(page);
    // Build: 1(0,0)→2(0,1)→3(0,2)→4(1,2)→5(1,1)→6(1,0)
    await dragPath(page, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    // Drag from (0,1)=2 to (1,1): drag only reaches val=3, so only old 3 is evicted
    await dragPath(page, [[0, 1], [1, 1]]);
    // (1,0)=6 was not reached by drag → stays
    await expect(cell(page, 1, 0)).toHaveText('6');
    // New value 3 is placed at (1,1)
    await expect(cell(page, 1, 1)).toHaveText('3');
  });
});
