// ─── Number Chain — 谜题生成逻辑 ─────────────────────────────
// 无外部依赖，不引用 game.js

const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function gKey(r, c) { return `${r},${c}`; }

function gShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function gFreeNeighbors(r, c, rows, cols, blocked, visited) {
  return DIRS8
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) =>
      nr >= 0 && nr < rows &&
      nc >= 0 && nc < cols &&
      !blocked.has(gKey(nr, nc)) &&
      !visited.has(gKey(nr, nc))
    );
}

// Warnsdorff 启发式：每步选择后继邻格最少的方向，随机打破平局
function gWarnsdorff(rows, cols, blocked, totalCells, startR, startC) {
  const visited = new Set([gKey(startR, startC)]);
  const path = [[startR, startC]];

  while (path.length < totalCells) {
    const [r, c] = path[path.length - 1];
    const nbrs = gFreeNeighbors(r, c, rows, cols, blocked, visited);
    if (nbrs.length === 0) return null;

    const withDeg = nbrs.map(n => ({
      cell: n,
      deg: gFreeNeighbors(n[0], n[1], rows, cols, blocked, visited).length
    }));
    withDeg.sort((a, b) => a.deg - b.deg);

    const minDeg = withDeg[0].deg;
    const ties = withDeg.filter(x => x.deg === minDeg);
    const chosen = ties[Math.floor(Math.random() * ties.length)];

    const [nr, nc] = chosen.cell;
    visited.add(gKey(nr, nc));
    path.push([nr, nc]);
  }

  return path;
}

// 从路径中选取 fixedCount 个格子作为固定提示（始终包含起点和终点）
function gSelectFixed(path, fixedCount) {
  const n = path.length;
  fixedCount = Math.max(2, Math.min(fixedCount, n));
  const indices = new Set([0, n - 1]);

  const middle = Array.from({ length: n - 2 }, (_, i) => i + 1);
  gShuffle(middle);

  for (let i = 0; i < middle.length && indices.size < fixedCount; i++) {
    indices.add(middle[i]);
  }
  return indices;
}

function gBuildCsv(rows, cols, path, fixedIndices, blocked) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill('0'));
  for (const k of blocked) {
    const [r, c] = k.split(',').map(Number);
    grid[r][c] = 'X';
  }
  path.forEach(([r, c], i) => {
    if (fixedIndices.has(i)) grid[r][c] = String(i + 1);
  });
  const lines = [`${rows},${cols}`];
  for (let r = 0; r < rows; r++) lines.push(grid[r].join(','));
  return lines.join('\n');
}

// 主接口：{ rows, cols, blockedCount, fixedCount } → { path, blocked, csv, rows, cols } | { error }
function generatePuzzle({ rows, cols, blockedCount, fixedCount }) {
  const totalNonBlocked = rows * cols - blockedCount;
  if (totalNonBlocked < 2) return { error: '非封锁格太少，无法生成路径' };
  fixedCount = Math.max(2, Math.min(fixedCount, totalNonBlocked));

  const allCells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      allCells.push([r, c]);

  for (let attempt = 0; attempt < 50; attempt++) {
    gShuffle(allCells);
    const blocked = new Set(allCells.slice(0, blockedCount).map(([r, c]) => gKey(r, c)));
    const freeCells = allCells.slice(blockedCount);
    gShuffle(freeCells);

    for (let si = 0; si < Math.min(8, freeCells.length); si++) {
      const [sr, sc] = freeCells[si];
      const path = gWarnsdorff(rows, cols, blocked, totalNonBlocked, sr, sc);
      if (!path) continue;

      const fixedIndices = gSelectFixed(path, fixedCount);
      const csv = gBuildCsv(rows, cols, path, fixedIndices, blocked);
      return { path, blocked, csv, rows, cols };
    }
  }

  return { error: '生成失败，请尝试减少封锁格数量或重新生成' };
}
