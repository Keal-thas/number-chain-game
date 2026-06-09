// ─── Number Chain — Hidato 求解器 ────────────────────────────
// 回溯法，无外部依赖
// solvePuzzle(puzzle) → result[r][c] = value | null（blocked 也是 null）
//                     → null 表示无解或超时

function solvePuzzle(puzzle) {
  const { rows, cols, grid, totalCells } = puzzle;
  const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  // pos[v] = [r, c]，null 表示未放置（下标 1..totalCells）
  const pos  = new Array(totalCells + 1).fill(null);
  // used[r][c]：格子是否已占用（blocked 或已放值）
  const used = Array.from({ length: rows }, () => new Array(cols).fill(false));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.type === 'blocked') {
        used[r][c] = true;
      } else if (cell.type === 'fixed') {
        pos[cell.value] = [r, c];
        used[r][c] = true;
      }
    }
  }

  function isAdj(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && (r1 !== r2 || c1 !== c2);
  }

  function freeNeighbors(r, c) {
    const out = [];
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !used[nr][nc])
        out.push([nr, nc]);
    }
    return out;
  }

  // nextFixed[v] = 下一个值 > v 的固定格 {val, r, c}，用于 Chebyshev 剪枝
  const nextFixed = new Array(totalCells + 2).fill(null);
  for (let v = totalCells; v >= 1; v--) {
    if (pos[v] !== null)
      nextFixed[v - 1] = { val: v, r: pos[v][0], c: pos[v][1] };
    else
      nextFixed[v - 1] = nextFixed[v];
  }

  let steps = 0;
  const MAX_STEPS = 10_000_000;

  function solve(v) {
    if (v > totalCells) return true;
    if (++steps > MAX_STEPS) return false;

    if (pos[v] !== null) {
      // 固定格：检查与前一个值相邻
      if (v > 1) {
        const [pr, pc] = pos[v - 1];
        const [cr, cc] = pos[v];
        if (!isAdj(pr, pc, cr, cc)) return false;
      }
      return solve(v + 1);
    }

    // 非固定格：尝试 pos[v-1] 的所有自由邻格
    const [pr, pc] = pos[v - 1];
    const nf = nextFixed[v];
    for (const [nr, nc] of freeNeighbors(pr, pc)) {
      // Chebyshev 剪枝：若候选格到下一固定格距离 > 剩余步数，跳过
      if (nf && Math.max(Math.abs(nr - nf.r), Math.abs(nc - nf.c)) > nf.val - v) continue;
      pos[v] = [nr, nc];
      used[nr][nc] = true;
      if (solve(v + 1)) return true;
      pos[v] = null;
      used[nr][nc] = false;
    }
    return false;
  }

  // 值 1 固定时直接开始；否则枚举所有自由格作为起点
  let found = false;
  if (pos[1] !== null) {
    found = solve(1);
  } else {
    const nf1 = nextFixed[1];
    outer: for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!used[r][c]) {
          // Chebyshev 剪枝：起点到下一固定格距离 > 剩余步数，跳过
          if (nf1 && Math.max(Math.abs(r - nf1.r), Math.abs(c - nf1.c)) > nf1.val - 1) continue;
          pos[1] = [r, c];
          used[r][c] = true;
          if (solve(2)) { found = true; break outer; }
          pos[1] = null;
          used[r][c] = false;
        }
      }
    }
  }

  if (!found) return null;

  const result = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (let v = 1; v <= totalCells; v++) {
    if (pos[v]) result[pos[v][0]][pos[v][1]] = v;
  }
  return result;
}
