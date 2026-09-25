import type { Opening, Room, Vec2 } from "../model/types";
import { add, cross, dot, len, norm, perp, rotate, scale, sub } from "./vec";
import { pointInPolygon, pointSegmentDistance, type Polygon } from "./polygon";

export interface Wall {
  index: number;
  a: Vec2;
  b: Vec2;
  /** Unit vector from a to b. */
  dir: Vec2;
  /** Unit vector pointing into the room. */
  inward: Vec2;
  length: number;
  /** Whether the room corner at a / b sticks outward (true) or is an inner corner of an L (false). */
  convexA: boolean;
  convexB: boolean;
}

const wallCache = new WeakMap<Vec2[], Wall[]>();

/** Wall i runs from outline[i] to outline[i+1]. Cached per outline array. */
export function getWalls(room: Room): Wall[] {
  const cached = wallCache.get(room.outline);
  if (cached) return cached;
  const o = room.outline;
  const n = o.length;
  const walls: Wall[] = o.map((a, i) => {
    const b = o[(i + 1) % n];
    const dir = norm(sub(b, a));
    // Pick the side of the wall that is inside the room by testing a point
    // just off its midpoint. Works for either winding order.
    let inward = perp(dir);
    const mid = scale(add(a, b), 0.5);
    if (!pointInPolygon(add(mid, scale(inward, 0.5)), o)) inward = scale(inward, -1);
    return { index: i, a, b, dir, inward, length: len(sub(b, a)), convexA: true, convexB: true };
  });
  // A corner is convex when turning from the previous wall to the next turns
  // toward the inside of the room.
  walls.forEach((w, i) => {
    const prev = walls[(i - 1 + n) % n];
    const turn = cross(prev.dir, w.dir);
    const insideTurn = cross(prev.dir, prev.inward);
    w.convexA = Math.sign(turn) === Math.sign(insideTurn) || Math.abs(turn) < 1e-9;
    prev.convexB = w.convexA;
  });
  wallCache.set(room.outline, walls);
  return walls;
}

export interface OpeningSpan {
  wall: Wall;
  /** Opening edge nearer the wall start, and the far edge. */
  a: Vec2;
  b: Vec2;
  from: number;
  to: number;
}

export function openingSpan(room: Room, op: Opening): OpeningSpan | null {
  const wall = getWalls(room)[op.wall];
  if (!wall) return null;
  const from = Math.max(0, Math.min(op.offset, wall.length));
  const to = Math.max(from, Math.min(op.offset + op.width, wall.length));
  return { wall, from, to, a: add(wall.a, scale(wall.dir, from)), b: add(wall.a, scale(wall.dir, to)) };
}

export interface DoorGeometry {
  hinge: Vec2;
  /** The latch edge when the door is closed. */
  latch: Vec2;
  radius: number;
  /** Unit vector the door leaf points along when closed (hinge → latch). */
  closedDir: Vec2;
  /** Unit vector the leaf points along when fully open (into or out of the room). */
  openDir: Vec2;
  /** +1 or -1: the rotation direction (in plan degrees) that opens the door. */
  sign: number;
}

export function doorGeometry(room: Room, op: Opening): DoorGeometry | null {
  const span = openingSpan(room, op);
  if (!span) return null;
  const { wall, a, b } = span;
  // Standing inside, facing the door: you face outward; "right" is a quarter
  // turn clockwise from that. See perp() for why that's this formula.
  const facing = scale(wall.inward, -1);
  const right = perp(facing);
  const bIsRight = dot(sub(b, a), right) > 0;
  const hingeRight = op.hinge !== "left";
  const hinge = hingeRight === bIsRight ? b : a;
  const latch = hinge === b ? a : b;
  const closedDir = norm(sub(latch, hinge));
  const openDir = op.swing === "out" ? facing : wall.inward;
  const sign = cross(closedDir, openDir) > 0 ? 1 : -1;
  return { hinge, latch, radius: len(sub(latch, hinge)), closedDir, openDir, sign };
}

/** The door leaf as a thin rectangle opened `angle` degrees (0 = closed). */
export function doorLeaf(g: DoorGeometry, angle: number, thickness = 4): Polygon {
  const d = rotate(g.closedDir, g.sign * angle);
  const n = scale(rotate(g.closedDir, g.sign * (angle + 90)), thickness);
  // Keep the leaf a hair shorter so it doesn't touch the far wall when closed.
  const end = add(g.hinge, scale(d, g.radius - 1));
  return [add(g.hinge, scale(d, 1)), end, add(end, n), add(add(g.hinge, scale(d, 1)), n)];
}

/** The quarter-circle the door sweeps through, as a convex polygon. */
export function doorSwingPolygon(g: DoorGeometry, steps = 10): Polygon {
  const pts: Vec2[] = [g.hinge];
  for (let i = 0; i <= steps; i++) {
    pts.push(add(g.hinge, scale(rotate(g.closedDir, (g.sign * 90 * i) / steps), g.radius)));
  }
  return pts;
}

/** A strip along an opening, reaching `depth` cm into the room. Optionally wider by `pad` each side. */
export function zoneInFront(room: Room, op: Opening, depth: number, pad = 0, minWidth = 0): Polygon | null {
  const span = openingSpan(room, op);
  if (!span) return null;
  const { wall } = span;
  const extra = Math.max(pad, (minWidth - (span.to - span.from)) / 2, 0);
  const a = add(span.a, scale(wall.dir, -extra));
  const b = add(span.b, scale(wall.dir, extra));
  const n = scale(wall.inward, depth);
  return [a, b, add(b, n), add(a, n)];
}

/** Mid-point of a wall, pushed `out` cm outside the room (for labels). */
export function wallLabelPoint(w: Wall, out: number): Vec2 {
  return add(scale(add(w.a, w.b), 0.5), scale(w.inward, -out));
}

/**
 * After the outline changes, move each opening onto the matching wall of the
 * new outline and keep it within that wall.
 * - Same number of walls (e.g. the room just got wider): wall i is still wall i.
 * - Different number (rectangle ↔ L): wall numbers shift, so each opening goes
 *   to the new wall that runs the same way and is nearest to where it was.
 */
export function remapOpenings(oldRoom: Room, newRoom: Room): Opening[] {
  const oldWalls = getWalls(oldRoom);
  const newWalls = getWalls(newRoom);
  const sameTopology = oldWalls.length === newWalls.length;
  return oldRoom.openings.map((o) => {
    let wall = Math.min(o.wall, newWalls.length - 1);
    let offset = o.offset;
    const ow = oldWalls[o.wall];
    if (!sameTopology && ow) {
      const start = add(ow.a, scale(ow.dir, o.offset));
      const mid = add(start, scale(ow.dir, o.width / 2));
      let best: { w: Wall; d: number } | null = null;
      for (const w of newWalls) {
        if (dot(w.dir, ow.dir) < 0.99) continue;
        const d = pointSegmentDistance(mid, w.a, w.b);
        if (!best || d < best.d) best = { w, d };
      }
      if (best) {
        wall = best.w.index;
        offset = dot(sub(start, best.w.a), best.w.dir);
      }
    }
    const L = newWalls[wall].length;
    const width = Math.min(o.width, L);
    return { ...o, wall, width, offset: Math.round(Math.max(0, Math.min(offset, L - width))) };
  });
}
