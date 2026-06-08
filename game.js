// ─── Layout ──────────────────────────────────────────────
const MAX_AREA = 520;
const MIN_CELL = 30;
const MAX_CELL = 54;
const MIN_GAP  = 24;
const MAX_GAP  = 42;

let CELL = 50;
let GAP  = 28;

// ─── State ───────────────────────────────────────────────
let puzzle      = null;        // {rows, cols, grid: [{type,value}][]}
let cellValue   = [];          // [r][c] = number | null  (fixed cells excluded)
let lockedCells = new Set();   // "r,c" keys — unique/locked cells
let active      = null;        // drag in progress: {cells:[[r,c,val],...], step:±1, unique}
let mode        = 'asc';
let uniqMode    = false;
let eraseMode   = false;
let dragging    = false;
let totalCells  = 0;

// ─── CSV ─────────────────────────────────────────────────
function parsePuzzle(csv) {
  const lines = csv.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const [rows, cols] = lines[0].split(',').map(Number);
  if (!rows || !cols) throw new Error('首行应为 行数,列数');

  let blocked = 0;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const parts = (lines[r + 1] || '').split(',').map(s => s.trim());
    const row = [];
    for (let c = 0; c < cols; c++) {
      const v = (parts[c] || '0').toUpperCase();
      if (v === 'X') { row.push({ type: 'blocked', value: null }); blocked++; }
      else if (v === '0') row.push({ type: 'empty', value: null });
      else {
        const n = parseInt(v);
        if (isNaN(n)) throw new Error(`无效值: "${v}"`);
        row.push({ type: 'fixed', value: n });
      }
    }
    grid.push(row);
  }
  return { rows, cols, grid, totalCells: rows * cols - blocked };
}

function loadPuzzle() {
  try {
    puzzle = parsePuzzle(document.getElementById('csv-input').value);
    totalCells = puzzle.totalCells;

    const n = Math.max(puzzle.rows, puzzle.cols);
    CELL = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor((MAX_AREA - (n - 1) * MIN_GAP) / n)));
    GAP  = Math.min(MAX_GAP,  Math.max(MIN_GAP,  Math.floor((MAX_AREA - n * CELL) / (n - 1))));

    cellValue   = Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill(null));
    lockedCells = new Set();
    active      = null;

    document.getElementById('controls').style.display = 'flex';
    render();
    showMsg('');
    updateProgress();
  } catch (e) {
    alert('解析失败: ' + e.message);
  }
}

function resetAll() {
  cellValue   = Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill(null));
  lockedCells = new Set();
  active      = null;
  eraseMode   = false;
  document.getElementById('btn-erase').classList.remove('active');
  document.getElementById('btn-erase').textContent = '✏ 擦除: 关';
  render();
  showMsg('');
  updateProgress();
}

// ─── Controls ────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('btn-asc').classList.toggle('active', m === 'asc');
  document.getElementById('btn-desc').classList.toggle('active', m === 'desc');
}

function toggleUnique() {
  uniqMode = !uniqMode;
  const b = document.getElementById('btn-unique');
  b.textContent = `唯一路径: ${uniqMode ? '开' : '关'}`;
  b.classList.toggle('active', uniqMode);
}

function toggleErase() {
  eraseMode = !eraseMode;
  const b = document.getElementById('btn-erase');
  b.textContent = `✏ 擦除: ${eraseMode ? '开' : '关'}`;
  b.classList.toggle('active', eraseMode);
}

function showMsg(t) { document.getElementById('message').textContent = t; }

function updateProgress() {
  const filled = countFilledCells();
  const pct = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
  document.getElementById('progress').textContent =
    totalCells > 0 ? `进度: ${filled} / ${totalCells} (${pct}%)${filled === totalCells ? ' 🎉 完成！' : ''}` : '';
}

function countFilledCells() {
  let count = 0;
  for (let r = 0; r < puzzle.rows; r++)
    for (let c = 0; c < puzzle.cols; c++) {
      if (puzzle.grid[r][c].type === 'fixed') count++;
      else if (cellValue[r][c] !== null) count++;
    }
  return count;
}

// ─── Graph Helpers ────────────────────────────────────────
// Two cells are connected iff they are adjacent and their values differ by exactly 1.
function getNeighbors(r, c) {
  const myVal = getEffectiveValue(r, c);
  if (myVal === null) return [];
  const result = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= puzzle.rows || nc < 0 || nc >= puzzle.cols) continue;
      const nVal = getEffectiveValue(nr, nc);
      if (nVal !== null && Math.abs(nVal - myVal) === 1) result.push([nr, nc]);
    }
  return result;
}

function getEffectiveValue(r, c) {
  return puzzle.grid[r][c].type === 'fixed' ? puzzle.grid[r][c].value : cellValue[r][c];
}

function inActive(r, c) {
  return active && active.cells.some(([pr, pc]) => pr === r && pc === c);
}

function isAdj(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && (r1 !== r2 || c1 !== c2);
}


// Remove a non-fixed cell from the graph (clear value; connections update automatically)
function evictPosition(r, c) {
  if (puzzle.grid[r][c].type === 'fixed') return;
  cellValue[r][c] = null;
  lockedCells.delete(`${r},${c}`);
}

// Remove whichever non-fixed cell currently holds this value
function evictValue(val) {
  for (let r = 0; r < puzzle.rows; r++)
    for (let c = 0; c < puzzle.cols; c++)
      if (cellValue[r][c] === val) { evictPosition(r, c); return; }
}

// BFS — clear all cells in the connected component rooted at (startR, startC).
// Fixed cells other than the start are treated as boundary anchors: visited but not expanded,
// preventing cascade into chains anchored at different fixed cells.
function clearConnectedPath(startR, startC) {
  const visited = new Set([`${startR},${startC}`]);
  const queue   = [[startR, startC]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if ((r !== startR || c !== startC) && puzzle.grid[r][c].type === 'fixed') continue;
    for (const [nr, nc] of getNeighbors(r, c)) {
      const key = `${nr},${nc}`;
      if (!visited.has(key)) { visited.add(key); queue.push([nr, nc]); }
    }
  }
  for (const key of visited) {
    const [r, c] = key.split(',').map(Number);
    if (puzzle.grid[r][c].type !== 'fixed') cellValue[r][c] = null;
    lockedCells.delete(key);
  }
}

function cellCenter(r, c) {
  const step = CELL + GAP;
  return [c * step + CELL / 2, r * step + CELL / 2];
}

// ─── Rendering ───────────────────────────────────────────
function getCellClass(r, c) {
  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return 'cell-blocked';
  if (base.type === 'fixed')   return inActive(r, c) ? 'cell-fixed cell-active-fixed' : 'cell-fixed';
  if (inActive(r, c))          return 'cell-active';
  if (cellValue[r][c] !== null)
    return lockedCells.has(`${r},${c}`) ? 'cell-unique' : 'cell-filled';
  return 'cell-empty';
}

function getCellText(r, c) {
  const base = puzzle.grid[r][c];
  if (base.type === 'fixed')   return base.value;
  if (base.type === 'blocked') return '';
  if (inActive(r, c)) {
    const idx = active.cells.findIndex(([pr, pc]) => pr === r && pc === c);
    return active.cells[idx][2];
  }
  return cellValue[r][c] ?? '';
}

function render() { renderCells(); renderSVG(); }

function renderCells() {
  const { rows, cols } = puzzle;
  const layer = document.getElementById('cells-layer');
  const step  = CELL + GAP;
  const W     = cols * step - GAP;
  const H     = rows * step - GAP;

  layer.style.width  = W + 'px';
  layer.style.height = H + 'px';
  layer.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
  layer.style.gap     = GAP + 'px';
  layer.style.display = 'grid';

  const svg = document.getElementById('svg-overlay');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  const area = document.getElementById('game-area');
  area.style.width  = W + 'px';
  area.style.height = H + 'px';

  const needed = rows * cols;
  while (layer.children.length < needed) layer.appendChild(document.createElement('div'));
  while (layer.children.length > needed) layer.lastChild.remove();

  const fs = Math.max(10, Math.round(CELL * 0.36)) + 'px';
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const div = layer.children[i++];
      div.className  = `cell ${getCellClass(r, c)}`;
      div.style.width  = CELL + 'px';
      div.style.height = CELL + 'px';
      div.style.fontSize = fs;
      div.dataset.r = r;
      div.dataset.c = c;
      div.textContent = getCellText(r, c);
    }
  }
}

function renderSVG() {
  const svg = document.getElementById('svg-overlay');
  svg.innerHTML = '';

  // Draw a line between every adjacent pair with consecutive values (draw once: from lower to higher)
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const myVal = getEffectiveValue(r, c);
      if (myVal === null) continue;
      for (const [nr, nc] of getNeighbors(r, c)) {
        const nVal = getEffectiveValue(nr, nc);
        if (nVal !== myVal + 1) continue; // only draw from smaller to larger to avoid duplicates
        const locked = lockedCells.has(`${r},${c}`) && lockedCells.has(`${nr},${nc}`);
        svg.appendChild(makeEdgeSegments(
          [cellCenter(r, c), cellCenter(nr, nc)],
          locked ? '#3ab87a' : '#3a6acc', 5, 0.9
        ));
      }
    }
  }

  // Active drag path
  if (active && active.cells.length > 1) {
    svg.appendChild(makeEdgeSegments(
      active.cells.map(([r, c]) => cellCenter(r, c)),
      '#5599dd', 5, 0.65
    ));
  }
}

function makeEdgeSegments(pts, stroke, width, opacity) {
  const R = CELL / 2 + 1;
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist, uy = dy / dist;
    const sx = x1 + R * ux, sy = y1 + R * uy;
    const ex = x2 - R * ux, ey = y2 - R * uy;
    d += `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)} `;
  }
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d.trim());
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', width);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('opacity', opacity);
  return el;
}

// ─── Drag ────────────────────────────────────────────────
function handleEraseClick(r, c) {
  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return;
  if (base.type === 'fixed') return;      // fixed cells cannot be erased
  if (cellValue[r][c] === null) return;
  cellValue[r][c] = null;
  lockedCells.delete(`${r},${c}`);
  render(); updateProgress();
}

function startDrag(r, c) {
  if (!puzzle) return;
  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return;
  if (eraseMode) { handleEraseClick(r, c); return; }

  const myVal = getEffectiveValue(r, c);
  if (myVal === null) { showMsg('请点击固定数字格或路径端点'); return; }

  const nbrs = getNeighbors(r, c);

  // Fixed cell: start drag; opposite-direction side untouched, same-direction evicted lazily
  if (base.type === 'fixed') {
    active = { cells: [[r, c, base.value]], step: mode === 'asc' ? 1 : -1, unique: uniqMode };
    dragging = true; showMsg(''); render(); return;
  }

  // Non-fixed endpoint (0 or 1 neighbor): extend using current mode direction
  if (nbrs.length <= 1) {
    const step = mode === 'asc' ? 1 : -1;
    active = { cells: [[r, c, myVal]], step, unique: lockedCells.has(`${r},${c}`) };
    dragging = true; showMsg(''); render(); return;
  }

  // Non-fixed middle cell (2+ neighbors): start drag from here; successor side evicted lazily
  active = { cells: [[r, c, myVal]], step: mode === 'asc' ? 1 : -1, unique: uniqMode };
  dragging = true; showMsg(''); render();
}

function extendDrag(r, c) {
  if (!dragging || !active) return;
  const cells    = active.cells;
  const [lr, lc] = cells[cells.length - 1];

  // Back-drag → pop
  if (cells.length >= 2) {
    const [pr, pc] = cells[cells.length - 2];
    if (pr === r && pc === c) { cells.pop(); render(); return; }
  }

  if (r === lr && c === lc) return;
  if (!isAdj(lr, lc, r, c)) return;

  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return;
  if (inActive(r, c)) return;

  const expectedVal = cells[cells.length - 1][2] + active.step;
  if (expectedVal < 1) { showMsg('已到最小值 1'); return; }
  if (expectedVal > totalCells) { showMsg(`已到最大值 ${totalCells}`); return; }

  if (base.type === 'fixed' && base.value !== expectedVal) {
    showMsg(`值不匹配：期望 ${expectedVal}，该格为 ${base.value}`);
    return;
  }

  // Reject if a fixed cell (other than the target) already holds expectedVal
  for (let fr = 0; fr < puzzle.rows; fr++) {
    for (let fc = 0; fc < puzzle.cols; fc++) {
      if (puzzle.grid[fr][fc].type === 'fixed' &&
          puzzle.grid[fr][fc].value === expectedVal &&
          !(fr === r && fc === c)) {
        showMsg(`值 ${expectedVal} 已被固定格占用`);
        return;
      }
    }
  }

  evictValue(expectedVal);
  evictPosition(r, c);
  cells.push([r, c, expectedVal]);
  showMsg('');
  render();
}

function endDrag() {
  if (!dragging || !active) { dragging = false; return; }

  if (active.cells.length >= 2) {
    for (const [r, c, val] of active.cells) {
      if (puzzle.grid[r][c].type !== 'fixed') cellValue[r][c] = val;
      if (active.unique) lockedCells.add(`${r},${c}`);
    }
  }

  active   = null;
  dragging = false;
  render();
  updateProgress();
}

// ─── Events (Pointer API) ────────────────────────────────
function eventPosFromXY(clientX, clientY) {
  const layer = document.getElementById('cells-layer');
  if (!layer || !puzzle) return null;
  const rect   = layer.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const step   = CELL + GAP;
  const radius = CELL / 2;
  const col    = Math.round(x / step);
  const row    = Math.round(y / step);
  if (row < 0 || row >= puzzle.rows || col < 0 || col >= puzzle.cols) return null;
  const cx = col * step + CELL / 2;
  const cy = row * step + CELL / 2;
  if (Math.hypot(x - cx, y - cy) > radius) return null;
  return [row, col];
}

const gameArea = document.getElementById('game-area');

gameArea.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  gameArea.setPointerCapture(e.pointerId);
  const p = eventPosFromXY(e.clientX, e.clientY);
  if (p) startDrag(...p);
});

gameArea.addEventListener('pointermove', e => {
  if (!dragging) return;
  const p = eventPosFromXY(e.clientX, e.clientY);
  if (p) extendDrag(...p);
});

gameArea.addEventListener('pointerup', e => {
  gameArea.releasePointerCapture(e.pointerId);
  endDrag();
});

gameArea.addEventListener('pointercancel', () => {
  active = null; dragging = false;
  if (puzzle) render();
});

gameArea.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('selectstart', e => {
  if (!e.target.closest('#setup')) e.preventDefault();
});
