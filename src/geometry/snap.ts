import type { FurnitureItem, Room, Vec2 } from "../model/types";
import { footprint } from "./items";
import { bounds, convexInsidePolygon, distanceToBoundary, pointInPolygon, rayToPolygon, satOverlap } from "./polygon";
import { getWalls, type Wall } from "./room";
import { add, dot, scale, sub, v } from "./vec";
import { isFlat } from "./items";

type Box = Pick<FurnitureItem, "x" | "y" | "width" | "depth" | "rotation">;

export interface Guide {
  a: Vec2;
  b: Vec2;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

/** How far (cm) the item's nearest corner is from the wall, measured into the room. Negative = past the wall. */
function gapToWall(poly: Vec2[], w: Wall): number {
  let m = Infinity;
  for (const c of poly) m = Math.min(m, dot(sub(c, w.a), w.inward));
  return m;
}

/** Does the item sit alongside this wall segment (not just on its infinite line)? */
function alongsideWall(poly: Vec2[], w: Wall): boolean {
  let lo = Infinity, hi = -Infinity;
  for (const c of poly) {
    const t = dot(sub(c, w.a), w.dir);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return hi > 1 && lo < w.length - 1;
}

/**
 * Snapping while dragging:
 * 1. Walls: if the item's closest corner is within `threshold` of a wall, slide
 *    it along that wall's normal until it touches. Works at any rotation.
 *    A second, non-parallel wall can snap too (so items drop into corners).
 * 2. Furniture: on any axis not already held by a wall, line the item's
 *    bounding box up with a neighbour's edges (side by side, or flush).
 */
export function snapItem(item: Box, others: FurnitureItem[], room: Room, threshold: number): SnapResult {
  let pos = v(item.x, item.y);
  const guides: Guide[] = [];
  const locked: Vec2[] = [];
  const walls = getWalls(room);

  for (let pass = 0; pass < 2; pass++) {
    const poly = footprint({ ...item, x: pos.x, y: pos.y });
    let best: { w: Wall; gap: number } | null = null;
    for (const w of walls) {
      if (locked.some((n) => Math.abs(dot(n, w.inward)) > 0.5)) continue;
      if (!alongsideWall(poly, w)) continue;
      const gap = gapToWall(poly, w);
      if (Math.abs(gap) <= threshold && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { w, gap };
    }
    if (!best) break;
    pos = add(pos, scale(best.w.inward, -best.gap));
    locked.push(best.w.inward);
    guides.push({ a: best.w.a, b: best.w.b });
  }

  const lockX = locked.some((n) => Math.abs(n.x) > 0.5);
  const lockY = locked.some((n) => Math.abs(n.y) > 0.5);
  const me = bounds(footprint({ ...item, x: pos.x, y: pos.y }));
  let bestX: { d: number; at: number; o: ReturnType<typeof bounds> } | null = null;
  let bestY: { d: number; at: number; o: ReturnType<typeof bounds> } | null = null;
  for (const other of others) {
    const o = bounds(footprint(other));
    const near = 60;
    const yNear = me.minY < o.maxY + near && me.maxY > o.minY - near;
    const xNear = me.minX < o.maxX + near && me.maxX > o.minX - near;
    if (!lockX && yNear) {
      for (const [d, at] of [
        [o.maxX - me.minX, o.maxX],
        [o.minX - me.maxX, o.minX],
        [o.minX - me.minX, o.minX],
        [o.maxX - me.maxX, o.maxX],
      ]) {
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at, o };
      }
    }
    if (!lockY && xNear) {
      for (const [d, at] of [
        [o.maxY - me.minY, o.maxY],
        [o.minY - me.maxY, o.minY],
        [o.minY - me.minY, o.minY],
        [o.maxY - me.maxY, o.maxY],
      ]) {
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at, o };
      }
    }
  }
  if (bestX) {
    pos = v(pos.x + bestX.d, pos.y);
    guides.push({ a: v(bestX.at, Math.min(me.minY, bestX.o.minY)), b: v(bestX.at, Math.max(me.maxY, bestX.o.maxY)) });
  }
  if (bestY) {
    pos = v(pos.x, pos.y + bestY.d);
    guides.push({ a: v(Math.min(me.minX, bestY.o.minX), bestY.at), b: v(Math.max(me.maxX, bestY.o.maxX), bestY.at) });
  }
  return { x: pos.x, y: pos.y, guides };
}

export interface WallDistance {
  from: Vec2;
  to: Vec2;
  distance: number;
}

/**
 * Distance from the item to the walls straight left, right, up and down on
 * the plan. Rays start from the item's outermost point on each side.
 */
export function distancesToWalls(item: Box, room: Room): WallDistance[] {
  const poly = footprint(item);
  const out: WallDistance[] = [];
  const dirs = [v(1, 0), v(-1, 0), v(0, 1), v(0, -1)];
  for (const d of dirs) {
    let best = -Infinity;
    for (const c of poly) best = Math.max(best, dot(c, d));
    const extreme = poly.filter((c) => dot(c, d) >= best - 0.5);
    const from = scale(extreme.reduce((s, c) => add(s, c), v(0, 0)), 1 / extreme.length);
    if (!pointInPolygon(from, room.outline) && distanceToBoundary(from, room.outline) > 0.5) continue;
    const t = rayToPolygon(add(from, scale(d, -0.01)), d, room.outline);
    if (t === null) continue;
    out.push({ from, to: add(from, scale(d, t)), distance: t });
  }
  return out;
}

/** A spot for a new item: inside the room, not overlapping anything, as central as possible. */
export function findFreeSpot(room: Room, items: FurnitureItem[], width: number, depth: number, flat: boolean): Vec2 | null {
  const b = bounds(room.outline);
  const centre = v((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  const obstacles = items.filter((i) => !i.staged && !isFlat(i)).map(footprint);
  const candidates: Vec2[] = [];
  for (let x = b.minX + width / 2; x <= b.maxX - width / 2; x += 10) {
    for (let y = b.minY + depth / 2; y <= b.maxY - depth / 2; y += 10) candidates.push(v(x, y));
  }
  candidates.sort((p, q) => Math.hypot(p.x - centre.x, p.y - centre.y) - Math.hypot(q.x - centre.x, q.y - centre.y));
  for (const c of candidates) {
    const poly = footprint({ x: c.x, y: c.y, width, depth, rotation: 0 });
    if (!convexInsidePolygon(poly, room.outline)) continue;
    if (!flat && obstacles.some((o) => satOverlap(poly, o) > 0.5)) continue;
    return c;
  }
  return null;
}

/**
 * First-person walking: can a person (a circle of `radius` cm) stand here?
 * Walls and any furniture taller than a rug block you.
 */
export function canStandAt(room: Room, items: FurnitureItem[], p: Vec2, radius: number): boolean {
  if (!pointInPolygon(p, room.outline) || distanceToBoundary(p, room.outline) < radius) return false;
  for (const it of items) {
    if (it.staged || isFlat(it)) continue;
    const fp = footprint(it);
    if (pointInPolygon(p, fp) || distanceToBoundary(p, fp) < radius) return false;
  }
  return true;
}
