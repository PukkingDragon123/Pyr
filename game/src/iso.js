// Isometric projection + pyramid geometry helpers.
// A "cube" occupies one grid cell (gx,gy) at height level gz. The pyramid for
// wonder tier k has `base` cubes per side on layer 0; each higher layer j is
// inset by j on every side (side = base - 2j) and sits at height z = j.

export const VH_RATIO = 0.62; // cube vertical face height as a fraction of unit

export function project(gx, gy, gz, cam) {
  const half = cam.u * 0.5, q = cam.u * 0.25, vh = cam.u * VH_RATIO;
  return {
    x: cam.ox + (gx - gy) * half,
    y: cam.oy + (gx + gy) * q - gz * vh,
  };
}

// Screen points of a cube whose top-center is (cx,cy). Returns the 3 visible faces.
export function cubeFaces(cx, cy, u) {
  const half = u * 0.5, q = u * 0.25, vh = u * VH_RATIO;
  const A = { x: cx, y: cy - q };          // back
  const B = { x: cx + half, y: cy };       // right
  const C = { x: cx, y: cy + q };          // front
  const D = { x: cx - half, y: cy };       // left
  return {
    top: [A, B, C, D],
    left: [D, C, { x: C.x, y: C.y + vh }, { x: D.x, y: D.y + vh }],
    right: [C, B, { x: B.x, y: B.y + vh }, { x: C.x, y: C.y + vh }],
  };
}

export function layerSide(base, j) { return base - 2 * j; }

// Cube cells of a layer in build/draw order (back → front, then left → right).
export function layerCells(base, j) {
  const side = layerSide(base, j);
  const cells = [];
  for (let gx = 0; gx < side; gx++)
    for (let gy = 0; gy < side; gy++)
      cells.push({ gx: j + gx, gy: j + gy });
  cells.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy) || a.gx - b.gx);
  return cells;
}

// Top-center screen coords for a layer-j cube cell.
export function cellTop(cell, j, cam) {
  return project(cell.gx, cell.gy, j + 1, cam); // top face is at z = j+1
}

// Bounding box of the whole pyramid in screen space (for fit + cache sizing).
export function pyramidBounds(base, layers, u) {
  const cam = { ox: 0, oy: 0, u };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const consider = (px, py) => {
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  };
  const half = u * 0.5, q = u * 0.25, vh = u * VH_RATIO;
  // base layer four corners (top + bottom of cubes)
  const corners = [[0, 0], [base - 1, 0], [0, base - 1], [base - 1, base - 1]];
  for (const [gx, gy] of corners) {
    const t = project(gx, gy, 1, cam);
    consider(t.x - half, t.y - q); consider(t.x + half, t.y + q + vh);
  }
  // apex
  const apexZ = layers;
  const ax = project(layers - 1, layers - 1, apexZ, cam);
  consider(ax.x, ax.y - q - vh);
  return { minX: minX - half, maxX: maxX + half, minY: minY - vh, maxY: maxY + vh };
}
