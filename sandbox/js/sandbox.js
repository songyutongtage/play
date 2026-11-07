(function () {
'use strict';

/* ================= 元素定义 ================= */
const EMPTY = 0, SAND = 1, WATER = 2, STONE = 3, WOOD = 4,
      OIL = 5, FIRE = 6, SMOKE = 7, STEAM = 8, ACID = 9;

const INFO = {
  [EMPTY]: { name: '橡皮', color: '#0b0d12' },
  [SAND]:  { name: '沙',   color: '#e0b96e' },
  [WATER]: { name: '水',   color: '#2f78de' },
  [STONE]: { name: '石',   color: '#6e7486' },
  [WOOD]:  { name: '木',   color: '#8a5c30' },
  [OIL]:   { name: '油',   color: '#61632f' },
  [FIRE]:  { name: '火',   color: '#ff8c1e' },
  [SMOKE]: { name: '烟',   color: '#4a4d57' },
  [STEAM]: { name: '汽',   color: '#b9cbdd' },
  [ACID]:  { name: '酸',   color: '#82e650' }
};

const PAL = new Uint8Array(16 * 3);
for (const k in INFO) {
  const n = parseInt(INFO[k].color.slice(1), 16);
  PAL[k * 3]     = (n >> 16) & 255;
  PAL[k * 3 + 1] = (n >> 8) & 255;
  PAL[k * 3 + 2] = n & 255;
}

const DENS = new Float32Array(16).fill(100);
DENS[EMPTY] = 0;
DENS[OIL]   = 1;
DENS[WATER] = 2;
DENS[ACID]  = 2;
DENS[SAND]  = 4;

/* ================= 画布 / 网格 ================= */
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d', { alpha: false });

const dpr = Math.min(window.devicePixelRatio || 1, 2);
let CELL = 4, GW = 0, GH = 0, BRUSH = 3;

let grid, life, moved;
let bufCanvas, bufCtx, imgData;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  CELL = Math.max(3, Math.ceil(canvas.width / 240));
  GW = Math.ceil(canvas.width / CELL);
  GH = Math.ceil(canvas.height / CELL);
  BRUSH = Math.max(2, Math.round(GW / 70));

  grid  = new Uint8Array(GW * GH);
  life  = new Uint8Array(GW * GH);
  moved = new Uint8Array(GW * GH);

  bufCanvas = document.createElement('canvas');
  bufCanvas.width = GW;
  bufCanvas.height = GH;
  bufCtx = bufCanvas.getContext('2d', { alpha: false });
  imgData = bufCtx.createImageData(GW, GH);
  const d = imgData.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;

  ctx.imageSmoothingEnabled = false;
}

/* ================= 基础操作 ================= */
function swapCells(a, b) {
  const t = grid[a]; grid[a] = grid[b]; grid[b] = t;
  const l = life[a]; life[a] = life[b]; life[b] = l;
  moved[a] = 1; moved[b] = 1;
}

function isFluid(t) {
  return t === EMPTY || t === WATER || t === OIL || t === ACID;
}

function tryMove(x, y, nx, ny, dens) {
  if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) return false;
  const a = y * GW + x, b = ny * GW + nx;
  const tb = grid[b];
  if (tb !== EMPTY && DENS[tb] >= dens) return false;
  swapCells(a, b);
  return true;
}

/* ================= 各元素行为 ================= */
function updatePowder(x, y, i, dens) {
  if (tryMove(x, y, x, y + 1, dens)) return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  if (tryMove(x, y, x + dir, y + 1, dens)) return;
  tryMove(x, y, x - dir, y + 1, dens);
}

function updateLiquid(x, y, i, dens) {
  if (tryMove(x, y, x, y + 1, dens)) return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  if (tryMove(x, y, x + dir, y + 1, dens)) return;
  if (tryMove(x, y, x - dir, y + 1, dens)) return;
  if (tryMove(x, y, x + dir, y, dens)) return;
  tryMove(x, y, x - dir, y, dens);
}

function updateGas(x, y, i, dens) {
  if (life[i] > 0) {
    life[i]--;
  } else {
    if (grid[i] === STEAM && Math.random() < 0.5) {
      grid[i] = WATER; life[i] = 0;
    } else {
      grid[i] = EMPTY;
    }
    return;
  }

  if (y > 0) {
    const b = (y - 1) * GW + x;
    if (isFluid(grid[b])) { swapCells(i, b); return; }
  }
  const dir = Math.random() < 0.5 ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const nx = x + (s === 0 ? dir : -dir), ny = y - 1;
    if (nx >= 0 && nx < GW && ny >= 0) {
      const b = ny * GW + nx;
      if (isFluid(grid[b])) { swapCells(i, b); return; }
    }
  }
  const bx = x + dir;
  if (bx >= 0 && bx < GW) {
    const b = y * GW + bx;
    if (grid[b] === EMPTY) swapCells(i, b);
  }
}

function updateFire(x, y, i) {
  if (life[i] > 0) {
    life[i]--;
  } else {
    grid[i] = Math.random() < 0.45 ? SMOKE : EMPTY;
    life[i] = 120;
    return;
  }

  const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let k = 0; k < 4; k++) {
    const nx = x + nb[k][0], ny = y + nb[k][1];
    if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) continue;
    const j = ny * GW + nx;
    const t = grid[j];

    if (t === WATER) {
      grid[i] = STEAM; life[i] = 130;
      return;
    }
    if (t === WOOD || t === OIL) {
      if (Math.random() < 0.22) {
        grid[j] = FIRE;
        life[j] = 50 + ((Math.random() * 60) | 0);
      }
    }
  }

  if (y > 0) {
    const b = (y - 1) * GW + x;
    if (grid[b] === EMPTY) { swapCells(i, b); return; }
  }
  if (Math.random() < 0.5) {
    const bx = x + (Math.random() < 0.5 ? 1 : -1);
    if (bx >= 0 && bx < GW) {
      const b = y * GW + bx;
      if (grid[b] === EMPTY) swapCells(i, b);
    }
  }
}

function updateAcid(x, y, i) {
  const nb = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  for (let k = 0; k < 4; k++) {
    const nx = x + nb[k][0], ny = y + nb[k][1];
    if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) continue;
    const j = ny * GW + nx;
    const t = grid[j];
    if (t !== EMPTY && t !== ACID && t !== WATER && Math.random() < 0.04) {
      grid[j] = EMPTY;
      if (Math.random() < 0.35) { grid[i] = EMPTY; return; }
      break;
    }
  }
  if (tryMove(x, y, x, y + 1, 2)) return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  if (tryMove(x, y, x + dir, y + 1, 2)) return;
  if (tryMove(x, y, x + dir, y, 2)) return;
  tryMove(x, y, x - dir, y, 2);
}

function updateCell(x, y, i) {
  switch (grid[i]) {
    case SAND:  updatePowder(x, y, i, 4); break;
    case WATER: updateLiquid(x, y, i, 2); break;
    case OIL:   updateLiquid(x, y, i, 1); break;
    case ACID:  updateAcid(x, y, i);      break;
    case FIRE:  updateFire(x, y, i);      break;
    case SMOKE: updateGas(x, y, i, 0.2);  break;
    case STEAM: updateGas(x, y, i, 0.2);  break;
  }
}

/* ================= 主循环 ================= */
function step() {
  moved.fill(0);
  for (let y = GH - 1; y >= 0; y--) {
    const base = y * GW;
    if (Math.random() < 0.5) {
      for (let x = 0; x < GW; x++) {
        const i = base + x;
        if (grid[i] === EMPTY || moved[i]) continue;
        updateCell(x, y, i);
      }
    } else {
      for (let x = GW - 1; x >= 0; x--) {
        const i = base + x;
        if (grid[i] === EMPTY || moved[i]) continue;
        updateCell(x, y, i);
      }
    }
  }
}

function render() {
  const d = imgData.data;
  const n = GW * GH;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const c = grid[i] * 3;
    d[p]     = PAL[c];
    d[p + 1] = PAL[c + 1];
    d[p + 2] = PAL[c + 2];
    p += 4;
  }
  bufCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(bufCanvas, 0, 0, GW * CELL, GH * CELL);
}

/* ================= 绘制输入 ================= */
let currentEl = SAND;
let painting = false;
let lastGX = null, lastGY = null;
let holdPos = null, holdNext = 0;

function initialLife(t) {
  if (t === FIRE)  return 50 + ((Math.random() * 50) | 0);
  if (t === SMOKE) return 90 + ((Math.random() * 80) | 0);
  if (t === STEAM) return 120 + ((Math.random() * 90) | 0);
  return 0;
}

function paint(cx, cy, el) {
  const r = BRUSH, r2 = r * r;
  const y0 = Math.max(0, cy - r), y1 = Math.min(GH - 1, cy + r);
  const x0 = Math.max(0, cx - r), x1 = Math.min(GW - 1, cx + r);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * GW + x;
      grid[i] = el;
      life[i] = initialLife(el);
      moved[i] = 1;
    }
  }
}

function stroke(x0, y0, x1, y1, el) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    paint(Math.round(x0 + dx * t), Math.round(y0 + dy * t), el);
  }
}

function toGrid(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return [
    Math.floor((clientX - r.left) / r.width * GW),
    Math.floor((clientY - r.top) / r.height * GH)
  ];
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  painting = true;
  if (canvas.setPointerCapture) {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  const p = toGrid(e.clientX, e.clientY);
  lastGX = p[0]; lastGY = p[1];
  holdPos = p;
  holdNext = performance.now() + 120;
  paint(p[0], p[1], currentEl);
});

canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  e.preventDefault();
  const p = toGrid(e.clientX, e.clientY);
  stroke(lastGX, lastGY, p[0], p[1], currentEl);
  lastGX = p[0]; lastGY = p[1];
  holdPos = p;
});

function endPaint() {
  painting = false;
  holdPos = null;
  lastGX = lastGY = null;
}
canvas.addEventListener('pointerup', endPaint);
canvas.addEventListener('pointercancel', endPaint);
canvas.addEventListener('pointerleave', endPaint);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ================= UI ================= */
const ui = document.getElementById('ui');

function buildUI() {
  ui.innerHTML = '';
  const list = [SAND, WATER, STONE, WOOD, OIL, FIRE, ACID, SMOKE, STEAM, EMPTY];

  list.forEach((id) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.el = id;
    if (id === currentEl) btn.classList.add('active');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = INFO[id].color;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(INFO[id].name));

    btn.addEventListener('click', () => {
      currentEl = id;
      ui.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });

    ui.appendChild(btn);
  });

  const clr = document.createElement('button');
  clr.type = 'button';
  clr.textContent = '清空';
  clr.addEventListener('click', () => {
    grid.fill(0);
    life.fill(0);
  });
  ui.appendChild(clr);
}

/* ================= 启动 ================= */
function loop() {
  if (holdPos && performance.now() > holdNext) {
    paint(holdPos[0], holdPos[1], currentEl);
    holdNext = performance.now() + 70;
  }
  step();
  render();
  requestAnimationFrame(loop);
}

let rzTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(resize, 220);
});
window.addEventListener('orientationchange', () => {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(resize, 320);
});

resize();
buildUI();
requestAnimationFrame(loop);

})();