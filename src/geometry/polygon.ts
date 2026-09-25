import type { Vec2 } from "../model/types";
import { cross, dist, dot, sub, v } from "./vec";

export type Polygon = Vec2[];

export function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function bounds(points: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function centroid(points: Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return v(x / points.length, y / points.length);
}

/** Even-odd ray casting. Points exactly on the edge may go either way; callers add tolerance. */
export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return v(a.x + ab.x * t, a.y + ab.y * t);
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestPointOnSegment(p, a, b));
}

/** Distance from a point to the nearest edge of a polygon (sign-less). */
export function distanceToBoundary(p: Vec2, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}

/** True when the segments cross at a single interior point (touching / collinear doesn't count). */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export interface ClosestPair {
  distance: number;
  /** Point on the first shape. */
  p: Vec2;
  /** Point on the second shape. */
  q: Vec2;
}

function edges(poly: Polygon): [Vec2, Vec2][] {
  // A 2-point "polygon" is a plain segment: one edge, not a there-and-back.
  if (poly.length === 2) return [[poly[0], poly[1]]];
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Vec2, Vec2]);
}

/**
 * Shortest distance between the outlines of two shapes (polygons or segments)
 * that don't overlap. For two non-crossing shapes the closest pair always
 * involves a corner of one of them, so we test every corner against every edge.
 */
export function closestBetween(a: Polygon, b: Polygon): ClosestPair {
  let best: ClosestPair = { distance: Infinity, p: a[0], q: b[0] };
  for (const pa of a) {
    for (const [s, e] of edges(b)) {
      const q = closestPointOnSegment(pa, s, e);
      const d = dist(pa, q);
      if (d < best.distance) best = { distance: d, p: pa, q };
    }
  }
  for (const pb of b) {
    for (const [s, e] of edges(a)) {
      const p = closestPointOnSegment(pb, s, e);
      const d = dist(pb, p);
      if (d < best.distance) best = { distance: d, p, q: pb };
    }
  }
  return best;
}

/**
 * Separating Axis Theorem for two convex polygons.
 * Idea: two convex shapes are apart if and only if you can find a direction
 * where their "shadows" (projections) don't overlap. For polygons you only
 * need to try the directions perpendicular to each edge. Rotated rectangles
 * are handled naturally because we use their real, rotated edges.
 *
 * Returns the smallest shadow overlap in cm: > 0 means they overlap by that
 * much (the penetration depth), <= 0 means they are separated.
 */
export function satOverlap(a: Polygon, b: Polygon): number {
  let minOverlap = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
      const l = Math.hypot(axis.x, axis.y);
      if (l < 1e-9) continue;
      axis.x /= l;
      axis.y /= l;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of a) { const d = p.x * axis.x + p.y * axis.y; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const p of b) { const d = p.x * axis.x + p.y * axis.y; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
      if (overlap <= 0) return overlap;
      if (overlap < minOverlap) minOverlap = overlap;
    }
  }
  return minOverlap;
}

/**
 * Is a convex shape entirely inside a (possibly concave, e.g. L-shaped) room?
 * - every corner of the shape is inside the room, and
 * - no room corner pokes into the shape (catches the inner corner of an L), and
 * - no edges cross.
 * `tol` forgives tiny overlaps with the walls (rounding, snapped items).
 */
export function convexInsidePolygon(shape: Polygon, room: Polygon, tol = 0.5): boolean {
  for (const p of shape) {
    if (!pointInPolygon(p, room) && distanceToBoundary(p, room) > tol) return false;
  }
  const shrunk = shrinkConvex(shape, tol);
  for (const c of room) if (pointInPolygon(c, shrunk)) return false;
  for (const [a, b] of edges(shrunk)) for (const [c, d] of edges(room)) if (segmentsCross(a, b, c, d)) return false;
  return true;
}

/** How far the shape's corners stick out of the room, in cm (0 if none do). */
export function protrusion(shape: Polygon, room: Polygon): number {
  let worst = 0;
  for (const p of shape) if (!pointInPolygon(p, room)) worst = Math.max(worst, distanceToBoundary(p, room));
  return worst;
}

/** Moves every corner of a convex polygon toward its centre by `by` cm (approximately). */
export function shrinkConvex(poly: Polygon, by: number): Polygon {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  cx /= poly.length;
  cy /= poly.length;
  return poly.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, l - by) / l;
    return v(cx + dx * k, cy + dy * k);
  });
}

/** Distance along a ray until it hits a polygon edge, or null. `dir` must be unit length. */
export function rayToPolygon(origin: Vec2, dir: Vec2, poly: Polygon): number | null {
  let best: number | null = null;
  for (const [a, b] of edges(poly)) {
    const e = sub(b, a);
    const denom = cross(dir, e);
    if (Math.abs(denom) < 1e-9) continue;
    const ao = sub(a, origin);
    const t = cross(ao, e) / denom;
    const u = cross(ao, dir) / denom;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}
