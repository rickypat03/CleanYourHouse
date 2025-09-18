// utils/geometry.util.ts

/** Snap a [min,max] con soglia */
export function snapTo(v: number, min: number, max: number, SNAP: number): number {

  if (Math.abs(v - min) <= SNAP) v = min;
  if (Math.abs(v - max) <= SNAP) v = max;

  return Math.min(max, Math.max(min, v));
}

/** ClientRect ipotetico di un node in (nx,ny) senza mutarlo */
export function getClientRectAt(node: any, nx: number, ny: number) {

  const old = node.position();
  node.position({ x: nx, y: ny });

  const rect = node.getClientRect({ skipShadow: true, skipStroke: false });
  node.position(old);

  return rect;
}

/** Collisione AABB tra due clientRect */
export function overlaps(a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}): boolean {
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

    const b = g.getClientRect({ skipShadow: true, skipStroke: false });

    if (overlaps(a, b)) return true;
  }
  return false;
}

/** Snap bordi di moving contro bordi degli altri (rettangoli axis-aligned) */
export function findSnapToEdgesGroup(

  moving: any,
  shapes: any[],
  body: any,
  nx: number,
  ny: number,
  SNAP: number
): { x: number; y: number } | null {

  const m = { x: nx, y: ny, w: body.width(), h: body.height() };

  let sx = nx, sy = ny, changed = false;

  for (const g of shapes) {

    if (g === moving) continue;

    const bRect = g.findOne('.body') as any;
    const o = { x: g.x(), y: g.y(), w: bRect.width(), h: bRect.height() };

    const vOverlap = !(m.y + m.h < o.y || o.y + o.h < m.y);
    const hOverlap = !(m.x + m.w < o.x || o.x + o.w < m.x);

    if (vOverlap) {
      if (Math.abs(m.x + m.w - o.x) <= SNAP) { sx = o.x - m.w; changed = true; }
      else if (Math.abs(m.x - (o.x + o.w)) <= SNAP) { sx = o.x + o.w; changed = true; }
    }
    if (hOverlap) {
      if (Math.abs(m.y + m.h - o.y) <= SNAP) { sy = o.y - m.h; changed = true; }
      else if (Math.abs(m.y - (o.y + o.h)) <= SNAP) { sy = o.y + o.h; changed = true; }
    }
  }
  
  return changed ? { x: sx, y: sy } : null;
}
