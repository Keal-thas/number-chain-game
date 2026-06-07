// ─── Layout ──────────────────────────────────────────────
const MAX_AREA = 520;
const MIN_CELL = 30;
const MAX_CELL = 54;
const MIN_GAP  = 24;
const MAX_GAP  = 42;

let CELL = 50;
let GAP  = 28;

// ─── State ───────────────────────────────────────────────
let puzzle    = null;   // {rows, cols, grid: [{type,value}][]}
let chains    = [];     // [{cells:[[r,c,val],...], ascending, unique}]
let active    = null;   // drag in progress: {cells:[[r,c,val],...], step:±1, unique, chainIdx, fromStart}
let mode      = 'asc';
let uniqMode  = false;
let eraseMode = false;
let dragging  = false;
let totalCells = 0;     // total non-blocked cells (= max number)

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

    // Compute layout
    const n = Math.max(puzzle.rows, puzzle.cols);
    CELL = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor((MAX_AREA - (n - 1) * MIN_GAP) / n)));
    GAP  = Math.min(MAX_GAP, Math.max(MIN_GAP, Math.floor((MAX_AREA - n * CELL) / (n - 1))));

    chains = [];
    active = null;
    document.getElementById('controls').style.display = 'flex';
    render();
    showMsg('');
    updateProgress();
  } catch (e) {
    alert('解析失败: ' + e.message);
  }
}

function resetAll() {
  chains = [];
  active = null;
  eraseMode = false;
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
  const seen = new Set();
  for (const ch of chains) {
    for (const [r, c] of ch.cells) seen.add(`${r},${c}`);
  }
  // Count fixed cells as filled too
  if (puzzle) {
    for (let r = 0; r < puzzle.rows; r++)
      for (let c = 0; c < puzzle.cols; c++)
        if (puzzle.grid[r][c].type === 'fixed') seen.add(`${r},${c}`);
  }
  return seen.size;
}

// ─── Helpers ─────────────────────────────────────────────
// Returns {ch: chain, idx: cellIndex} or null
// Skips the chain being replaced during an active drag (so those cells render as empty)
function findInChains(r, c) {
  for (let i = 0; i < chains.length; i++) {
    if (active && active.chainToReplace === i) continue;
    const idx = chains[i].cells.findIndex(([pr, pc]) => pr === r && pc === c);
    if (idx !== -1) return { ch: chains[i], idx };
  }
  return null;
}

// Returns chain index or -1
function findChainIdx(r, c) {
  for (let i = 0; i < chains.length; i++) {
    if (chains[i].cells.some(([pr, pc]) => pr === r && pc === c)) return i;
  }
  return -1;
}

function inActive(r, c) {
  return active && active.cells.some(([pr, pc]) => pr === r && pc === c);
}

function isAdj(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && (r1 !== r2 || c1 !== c2);
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

  const found = findInChains(r, c);
  if (found) return found.ch.unique ? 'cell-unique' : 'cell-filled';
  return 'cell-empty';
}

function getCellText(r, c) {
  const base = puzzle.grid[r][c];
  if (base.type === 'fixed') return base.value;
  if (base.type === 'blocked') return '';

  if (inActive(r, c)) {
    const idx = active.cells.findIndex(([pr, pc]) => pr === r && pc === c);
    return active.cells[idx][2];
  }

  const found = findInChains(r, c);
  if (found) return found.ch.cells[found.idx][2];
  return '';
}

function render() {
  renderCells();
  renderSVG();
}

function renderCells() {
  const { rows, cols } = puzzle;
  const layer  = document.getElementById('cells-layer');
  const step   = CELL + GAP;
  const W      = cols * step - GAP;
  const H      = rows * step - GAP;

  layer.style.width  = W + 'px';
  layer.style.height = H + 'px';
  layer.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
  layer.style.gap = GAP + 'px';
  layer.style.display = 'grid';

  // Resize SVG
  const svg = document.getElementById('svg-overlay');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  // Resize game-area
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
      const div  = layer.children[i++];
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

  const allPaths = [
    ...chains.filter((_, i) => !(active && active.chainToReplace === i)),
    ...(active && active.cells.length > 1 ? [{ ...active, _active: true }] : []),
  ];

  for (const p of allPaths) {
    if (p.cells.length < 2) continue;
    const pts   = p.cells.map(([r, c]) => cellCenter(r, c));
    const color = p._active ? '#5599dd' : (p.unique ? '#3ab87a' : '#3a6acc');
    const opacity = p._active ? 0.65 : 0.9;
    svg.appendChild(makeEdgeSegments(pts, color, 5, opacity));
  }
}

// Draw line segments from the EDGE of each circle to the EDGE of the next,
// so the lines never cover the numbers inside circles.
function makeEdgeSegments(pts, stroke, width, opacity) {
  const R = CELL / 2 + 1; // circle radius + tiny gap
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx   = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const ux   = dx / dist, uy = dy / dist;
    const sx   = x1 + R * ux, sy = y1 + R * uy;
    const ex   = x2 - R * ux, ey = y2 - R * uy;
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
  for (let ci = 0; ci < chains.length; ci++) {
    const ch  = chains[ci];
    const idx = ch.cells.findIndex(([pr, pc]) => pr === r && pc === c);
    if (idx === -1) continue;

    // Endpoint: just trim
    if (idx === 0) {
      ch.cells.shift();
      if (ch.cells.length === 0) chains.splice(ci, 1);
      // val stored in cells — no firstVal sync needed
    } else if (idx === ch.cells.length - 1) {
      ch.cells.pop();
      if (ch.cells.length === 0) chains.splice(ci, 1);
    } else {
      // Middle: split into two chains
      const left  = ch.cells.slice(0, idx);
      const right = ch.cells.slice(idx + 1);
      chains.splice(ci, 1);
      if (left.length  > 0) chains.push({ cells: left,  ascending: ch.ascending, unique: ch.unique });
      if (right.length > 0) chains.push({ cells: right, ascending: ch.ascending, unique: ch.unique });
      // vals already stored per-cell, no rightFirstVal calculation needed
    }

    render(); updateProgress(); return;
  }
}

function startDrag(r, c) {
  if (!puzzle) return;
  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return;

  if (eraseMode) { handleEraseClick(r, c); return; }

  // Case 1: endpoint of an existing chain → extend
  for (let ci = 0; ci < chains.length; ci++) {
    const ch    = chains[ci];
    const first = ch.cells[0];
    const last  = ch.cells[ch.cells.length - 1];

    if (last[0] === r && last[1] === c) {
      if (base.type === 'fixed') {
        // Fixed anchor at end: defer deletion to endDrag to avoid losing chain on misclick
        active = { cells: [[r, c, base.value]], step: mode === 'asc' ? 1 : -1,
                   unique: uniqMode, chainIdx: -1, fromStart: false, chainToReplace: ci };
      } else {
        active = { cells: [[r, c, last[2]]], step: ch.ascending ? 1 : -1,
                   unique: ch.unique, chainIdx: ci, fromStart: false };
      }
      dragging = true; showMsg(''); render(); return;
    }
    if (first[0] === r && first[1] === c) {
      if (base.type === 'fixed') {
        // Fixed anchor at start: defer deletion to endDrag to avoid losing chain on misclick
        active = { cells: [[r, c, base.value]], step: mode === 'asc' ? 1 : -1,
                   unique: uniqMode, chainIdx: -1, fromStart: false, chainToReplace: ci };
      } else {
        // Extending from start: step is reversed (going backwards along the chain)
        active = { cells: [[r, c, first[2]]], step: ch.ascending ? -1 : 1,
                   unique: ch.unique, chainIdx: ci, fromStart: true };
      }
      dragging = true; showMsg(''); render(); return;
    }
  }

  // Case 2: fixed cell not yet in any chain → start new chain
  if (base.type === 'fixed' && !findInChains(r, c)) {
    active = { cells: [[r, c, base.value]], step: mode === 'asc' ? 1 : -1,
               unique: uniqMode, chainIdx: -1, fromStart: false };
    dragging = true; showMsg(''); render(); return;
  }

  // Case 3: middle of a chain → trim tail, extend from here
  const found = findInChains(r, c);
  if (found) {
    const { ch, idx } = found;
    const ci = chains.indexOf(ch);
    ch.cells = ch.cells.slice(0, idx + 1);
    active = { cells: [[r, c, ch.cells[idx][2]]], step: ch.ascending ? 1 : -1,
               unique: ch.unique, chainIdx: ci, fromStart: false };
    dragging = true; showMsg('从此处继续'); render(); return;
  }

  showMsg('请点击固定数字格或路径端点');
}

function extendDrag(r, c) {
  if (!dragging || !active) return;
  const cells    = active.cells;
  const [lr, lc] = cells[cells.length - 1];

  // Back-drag → pop
  if (cells.length >= 2) {
    const [pr, pc] = cells[cells.length - 2];
    if (pr === r && pc === c) {
      cells.pop();
      render();
      return;
    }
  }

  if (r === lr && c === lc) return;
  if (!isAdj(lr, lc, r, c)) return;

  const base = puzzle.grid[r][c];
  if (base.type === 'blocked') return;
  if (inActive(r, c)) return;

  // Don't allow entering a cell already in a completed chain
  // Exception: cells from the chain being replaced are fair game
  const existingChainIdx = findChainIdx(r, c);
  if (existingChainIdx !== -1 && existingChainIdx !== (active.chainToReplace ?? -1)) return;

  // Expected value = last cell's val + step (±1)
  const expectedVal = cells[cells.length - 1][2] + active.step;
  if (expectedVal < 1) return;

  if (base.type === 'fixed' && base.value !== expectedVal) {
    showMsg(`值不匹配：期望 ${expectedVal}，该格为 ${base.value}`);
    return;
  }

  cells.push([r, c, expectedVal]);
  showMsg('');
  render();
}

function endDrag() {
  if (!dragging || !active) { dragging = false; return; }

  if (active.cells.length >= 2) {
    // Delete the old chain that was being replaced (deferred from startDrag)
    if (active.chainToReplace != null) {
      chains.splice(active.chainToReplace, 1);
    }
    if (active.chainIdx === -1) {
      // New chain
      chains.push({ cells: [...active.cells], ascending: active.step === 1, unique: active.unique });
    } else if (!active.fromStart) {
      // Extend existing chain at end: append cells[1:]
      const ch = chains[active.chainIdx];
      ch.cells.push(...active.cells.slice(1));
    } else {
      // Extend existing chain at start: prepend reversed cells[1:]
      // active.cells = [anchor, step1, step2, ...]  →  prepend [step2, step1] before anchor
      const ch = chains[active.chainIdx];
      ch.cells = [...active.cells.slice(1).reverse(), ...ch.cells];
      // vals already stored per-cell — no firstVal recalculation needed
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
  const rect = layer.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const step = CELL + GAP;
  const radius = CELL / 2;
  const col = Math.round(x / step);
  const row = Math.round(y / step);
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

// Block all text selection on the game area
gameArea.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('selectstart', e => {
  if (!e.target.closest('#setup')) e.preventDefault();
});
