// utils/geometry.util.ts

/** Snap a [min,max] con soglia */
export function snapTo(v: number, min: number, max: number, SNAP: number): number {
  if (Math.abs(v - min) <= SNAP) v = min;
  if (Math.abs(v - max) <= SNAP) v = max;
  return Math.min(max, Math.max(min, v));
}

/** ClientRect ipotetico di un node in (nx,ny) senza mutarlo (AABB visivo) */
export function getClientRectAt(node: any, nx: number, ny: number) {
  const old = node.position();
  node.position({ x: nx, y: ny });
  const rect = node.getClientRect({ skipShadow: true, skipStroke: true });
  node.position(old);
  return rect;
}

/** Collisione AABB tra due clientRect */
export function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/** collisione di moving (ipoteticamente a nx,ny) contro tutti gli altri in shapes */
export function collidesAnyGroup(moving: any, shapes: any[], nx: number, ny: number): boolean {
  const a = getClientRectAt(moving, nx, ny);
  for (const g of shapes) {
    if (g === moving) continue;
    const b = g.getClientRect({ skipShadow: true, skipStroke: true });
    if (overlaps(a, b)) return true;
  }
  return false;
}

/* ===================== SUPPORTO POLIGONI RUOTATI ===================== */

/** 4 vertici del Rect '.body' in coord di stage (ordine: TL, TR, BR, BL) */
export function getBodyPolygon(body: any): Array<{ x: number; y: number }> {
  const w = body.width();
  const h = body.height();
  const pts = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const T = body.getAbsoluteTransform();
  return pts.map((p) => T.point(p));
}

/** Come sopra ma ipotizzando che il GROUP sia a (nx,ny) — spostamento temporaneo robusto */
export function getBodyPolygonAt(group: any, body: any, nx: number, ny: number) {
  const prev = group.position();
  group.position({ x: nx, y: ny });
  const poly = getBodyPolygon(body);
  group.position(prev);
  return poly;
}

function edgeList(poly: Array<{ x: number; y: number }>) {
  const n = poly.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len,
      ty = dy / len; // tangente unitaria
    const nx = -ty,
      ny = tx; // normale unitaria
    const ang = Math.atan2(ty, tx);
    edges.push({ a, b, tx, ty, nx, ny, len, ang });
  }
  return edges;
}

function areParallel(angleA: number, angleB: number, epsRad: number) {
  // paralleli o antiparalleli entro eps: |cos(Δ)| ~ 1
  return Math.abs(Math.cos(angleA - angleB)) >= Math.cos(epsRad);
}

function projectPointOnAxis(px: number, py: number, ax: number, ay: number) {
  return px * ax + py * ay;
}

function intervalOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  const min = Math.max(aMin, bMin);
  const max = Math.min(aMax, bMax);
  return max - min; // >0 overlap, =0 tangenti, <0 separati
}

/**
 * Snap lato-lato tra due rettangoli ruotati.
 * Condizioni: quasi paralleli, proiezioni sovrapposte (con slack), distanza perpendicolare <= SNAP.
 * Ritorna {dx,dy,dist} con la correzione minima.
 */
export function snapPolysEdgeToEdge(
  movingPoly: Array<{ x: number; y: number }>,
  targetPoly: Array<{ x: number; y: number }>,
  SNAP: number,
  angleEps: number = Math.PI / 180 * 12,
  tangentSlack: number = SNAP
): { dx: number; dy: number; dist: number } | null {
  const mEdges = edgeList(movingPoly);
  const tEdges = edgeList(targetPoly);
  let best: { dx: number; dy: number; dist: number } | null = null;

  for (const me of mEdges) {
    for (const te of tEdges) {
      if (!areParallel(me.ang, te.ang, angleEps)) continue;

      const ax = te.tx,
        ay = te.ty;
      const mMin = Math.min(projectPointOnAxis(me.a.x, me.a.y, ax, ay), projectPointOnAxis(me.b.x, me.b.y, ax, ay));
      const mMax = Math.max(projectPointOnAxis(me.a.x, me.a.y, ax, ay), projectPointOnAxis(me.b.x, me.b.y, ax, ay));
      const tMin = Math.min(projectPointOnAxis(te.a.x, te.a.y, ax, ay), projectPointOnAxis(te.b.x, te.b.y, ax, ay));
      const tMax = Math.max(projectPointOnAxis(te.a.x, te.a.y, ax, ay), projectPointOnAxis(te.b.x, te.b.y, ax, ay));

      const ov = intervalOverlap(mMin, mMax, tMin, tMax);
      if (ov <= -tangentSlack) continue;

      const mx = (me.a.x + me.b.x) / 2;
      const my = (me.a.y + me.b.y) / 2;
      const tx0 = te.a.x,
        ty0 = te.a.y;
      const dSigned = (mx - tx0) * te.nx + (my - ty0) * te.ny;
      const dist = Math.abs(dSigned);
      if (dist <= SNAP) {
        const dx = -dSigned * te.nx;
        const dy = -dSigned * te.ny;
        if (!best || dist < best.dist) best = { dx, dy, dist };
      }
    }
  }
  return best;
}

/** Snap principale (rotated) tra Group in (nx,ny) e le altre shape; sceglie la correzione migliore */
export function findSnapToEdgesGroupRotated(
  movingGroup: any,
  shapes: any[],
  body: any,
  nx: number,
  ny: number,
  SNAP: number
): { x: number; y: number } | null {
  // broad phase: AABB del moving alla posizione proposta
  const mAabb = getClientRectAt(movingGroup, nx, ny);
  const movingPoly = getBodyPolygonAt(movingGroup, body, nx, ny);

  let best: { x: number; y: number; dist: number } | null = null;
  const M = SNAP * 1.5;

  for (const g of shapes) {
    if (g === movingGroup) continue;
    const otherBody = g.findOne('.body');
    if (!otherBody) continue;

    // broad phase per scartare lontani
    const bAabb = g.getClientRect({ skipShadow: true, skipStroke: true });
    const farX = mAabb.x > bAabb.x + bAabb.width + M || bAabb.x > mAabb.x + mAabb.width + M;
    const farY = mAabb.y > bAabb.y + bAabb.height + M || bAabb.y > mAabb.y + mAabb.height + M;
    if (farX || farY) continue;

    const targetPoly = getBodyPolygon(otherBody);
    const cand = snapPolysEdgeToEdge(movingPoly, targetPoly, SNAP);
    if (cand) {
      const cx = nx + cand.dx;
      const cy = ny + cand.dy;
      if (!best || cand.dist < best.dist) best = { x: cx, y: cy, dist: cand.dist };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

/* ---------- Corner→Edge fallback (opzionale, non usato qui ma pronto) ---------- */
function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}
function pointToSegmentSnap(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax,
    vy = by - ay;
  const wx = px - ax,
    wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp01((wx * vx + wy * vy) / len2);
  const sx = ax + t * vx,
    sy = ay + t * vy;
  const dx = px - sx,
    dy = py - sy;
  const dist = Math.hypot(dx, dy);
  return { sx, sy, dx: -dx, dy: -dy, dist };
}
export function snapVertexToEdges(
  movingPoly: Array<{ x: number; y: number }>,
  targetPoly: Array<{ x: number; y: number }>,
  SNAP: number
): { dx: number; dy: number } | null {
  const tEdges = edgeList(targetPoly);
  let best: { dx: number; dy: number; dist: number } | null = null;
  for (const p of movingPoly) {
    for (const te of tEdges) {
      const s = pointToSegmentSnap(p.x, p.y, te.a.x, te.a.y, te.b.x, te.b.y);
      if (s.dist <= SNAP) {
        if (!best || s.dist < best.dist) best = { dx: s.dx, dy: s.dy, dist: s.dist };
      }
    }
  }
  return best ? { dx: best.dx, dy: best.dy } : null;
}
