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

// ─── Strategy: Warnsdorff ─────────────────────────────────
// 每步选后继邻格最少的方向，路径顺滑，难度低
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

// ─── Strategy: Backbite (MCMC) ───────────────────────────
// 先用 Warnsdorff 生成初始路径，再用 backbite move 随机化。
//
// Backbite move（作用于端点 path[0]）：
//   找路径中与 path[0] 相邻的格子 path[s]（s≥2）
//   翻转 path[0..s-1]  →  新端点变为 path[s-1]
//   路径仍然合法（每对相邻元素仍然在网格上相邻）
//
// numMoves 越多，路径越接近均匀随机，谜题难度越高。
// 无回溯，永不失败，速度取决于 numMoves × O(n)。
function gBackbite(rows, cols, blocked, totalCells, numMoves) {
  // 用 Warnsdorff 找初始路径
  const allFree = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (!blocked.has(gKey(r, c)))
        allFree.push([r, c]);
  gShuffle(allFree);

  let path = null;
  for (let i = 0; i < Math.min(8, allFree.length); i++) {
    path = gWarnsdorff(rows, cols, blocked, totalCells, allFree[i][0], allFree[i][1]);
    if (path) break;
  }
  if (!path) return null;

  // posIdx[key] = 该格在 path 中的下标
  const posIdx = new Map(path.map(([r, c], i) => [gKey(r, c), i]));

  for (let m = 0; m < numMoves; m++) {
    // 随机选端点（path[0] 或 path[n-1]）
    const useStart = Math.random() < 0.5;
    const eI    = useStart ? 0 : path.length - 1;
    const skipI = useStart ? 1 : path.length - 2;
    const [er, ec] = path[eI];

    // 找端点在路径中的邻格（排除相邻步，避免退化）
    const cands = [];
    for (const [dr, dc] of DIRS8) {
      const nr = er + dr, nc = ec + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (blocked.has(gKey(nr, nc))) continue;
      const ni = posIdx.get(gKey(nr, nc));
      if (ni !== undefined && ni !== skipI) cands.push(ni);
    }
    if (!cands.length) continue;

    const s = cands[Math.floor(Math.random() * cands.length)];

    // 原地翻转目标片段，同步更新 posIdx
    if (useStart) {
      for (let i = 0, j = s - 1; i < j; i++, j--)
        [path[i], path[j]] = [path[j], path[i]];
      for (let i = 0; i < s; i++)
        posIdx.set(gKey(path[i][0], path[i][1]), i);
    } else {
      for (let i = s + 1, j = path.length - 1; i < j; i++, j--)
        [path[i], path[j]] = [path[j], path[i]];
      for (let i = s + 1; i < path.length; i++)
        posIdx.set(gKey(path[i][0], path[i][1]), i);
    }
  }

  return path;
}

// ─── Strategy registry ────────────────────────────────────
// 新增策略：往此数组追加一个 entry，UI 自动渲染，无需改 HTML
const STRATEGIES = [
  {
    id: 'warnsdorff',
    label: 'Warnsdorff',
    desc: '路径顺滑，速度极快，难度低',
    fn: gWarnsdorff,
  },
  {
    id: 'backbite_medium',
    label: 'Backbite 中等',
    desc: '随机化路径，折返适中，难度中等',
    fn: (rows, cols, blocked, n) => gBackbite(rows, cols, blocked, n, n * 80),
  },
  {
    id: 'backbite_hard',
    label: 'Backbite 困难',
    desc: '深度随机化，路径复杂，难度高',
    fn: (rows, cols, blocked, n) => gBackbite(rows, cols, blocked, n, n * 500),
  },
];

// ─── 辅助：固定格选取 ─────────────────────────────────────
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

// ─── 主接口 ───────────────────────────────────────────────
// { rows, cols, blockedCount, fixedCount, strategyId }
// → { path, blocked, csv, rows, cols, strategyId } | { error }
function generatePuzzle({ rows, cols, blockedCount, fixedCount, strategyId = 'warnsdorff' }) {
  const totalNonBlocked = rows * cols - blockedCount;
  if (totalNonBlocked < 2) return { error: '非封锁格太少，无法生成路径' };
  fixedCount = Math.max(2, Math.min(fixedCount, totalNonBlocked));

  const strategy = STRATEGIES.find(s => s.id === strategyId) || STRATEGIES[0];

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
      const path = strategy.fn(rows, cols, blocked, totalNonBlocked, sr, sc);
      if (!path) continue;

      const fixedIndices = gSelectFixed(path, fixedCount);
      const csv = gBuildCsv(rows, cols, path, fixedIndices, blocked);
      return { path, blocked, csv, rows, cols, strategyId };
    }
  }

  return { error: '生成失败，请尝试减少封锁格数量或重新生成' };
}
