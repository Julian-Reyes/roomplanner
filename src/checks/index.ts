import type { FurnitureItem, Issue, Room, Severity, Vec2 } from "../model/types";
import { footprint, frontZone, isFlat, tucksUnder } from "../geometry/items";
import {
  closestBetween,
  convexInsidePolygon,
  pointInPolygon,
  protrusion,
  satOverlap,
  type Polygon,
} from "../geometry/polygon";
import { doorGeometry, doorLeaf, doorSwingPolygon, getWalls, zoneInFront } from "../geometry/room";
import { add, dot, lerp, norm, perp, scale, sub } from "../geometry/vec";

export interface CheckOptions {
  /** Walkways narrower than this get a warning (cm). */
  walkwayWarn: number;
  /** ...and narrower than this, an error. */
  walkwayError: number;
  /**
   * Gaps narrower than this are treated as "pushed together" rather than as a
   * walkway: nobody tries to walk through 15 cm, so it isn't a walkway problem.
   */
  walkwayIgnoreBelow: number;
}

export const DEFAULT_CHECK_OPTIONS: CheckOptions = { walkwayWarn: 60, walkwayError: 45, walkwayIgnoreBelow: 25 };

// Sizes of the zones in front of wall features (cm).
const WINDOW_ZONE = 30;
const RADIATOR_ZONE = 40; // ~10 cm of radiator + 30 cm for warm air to circulate
const OUTLET_ZONE = 15;
const DOORWAY_ZONE = 50;
/** Overlaps smaller than this are rounding noise from snapping, not a real problem. */
const EPS = 0.5;

const r = (n: number) => Math.round(n);

export function runChecks(room: Room, items: FurnitureItem[], opts: CheckOptions = DEFAULT_CHECK_OPTIONS): Issue[] {
  const issues: Issue[] = [];
  const placed = items.filter((i) => !i.staged);
  const solid = placed.filter((i) => !isFlat(i));
  const fp = new Map<string, Polygon>(placed.map((i) => [i.id, footprint(i)]));
  const F = (i: FurnitureItem) => fp.get(i.id)!;
  const outline = room.outline;

  // 1. Outside the room / through a wall.
  const outside = new Set<string>();
  for (const it of placed) {
    if (convexInsidePolygon(F(it), outline, EPS)) continue;
    outside.add(it.id);
    issues.push({
      id: `outside:${it.id}`,
      code: "outsideRoom",
      severity: isFlat(it) ? "warning" : "error",
      itemIds: [it.id],
      openingIds: [],
      params: { a: it.id, cm: Math.max(1, r(protrusion(F(it), outline))) },
    });
  }

  // 2. Furniture overlapping furniture (rotated boxes via SAT, see polygon.ts).
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (tucksUnder(a, b) || tucksUnder(b, a)) continue;
      const depth = satOverlap(F(a), F(b));
      if (depth <= EPS) continue;
      issues.push({
        id: `overlap:${a.id}:${b.id}`,
        code: "overlap",
        severity: "error",
        itemIds: [a.id, b.id],
        openingIds: [],
        params: { a: a.id, b: b.id, cm: r(depth) },
      });
    }
  }

  const doorBlockers = new Set<string>();
  for (const op of room.openings) {
    // 3. Doors: anything in the quarter circle the door sweeps through.
    if (op.kind === "door") {
      const g = doorGeometry(room, op);
      if (!g) continue;
      if (op.swing !== "out") {
        const sector = doorSwingPolygon(g);
        const blockers = solid.filter((it) => satOverlap(sector, F(it)) > EPS);
        if (blockers.length) {
          // Open the leaf 1° at a time until it hits something.
          let maxAngle = 90;
          for (let ang = 1; ang <= 90; ang++) {
            const leaf = doorLeaf(g, ang);
            if (blockers.some((it) => satOverlap(leaf, F(it)) > 0)) {
              maxAngle = ang - 1;
              break;
            }
          }
          blockers.forEach((b) => doorBlockers.add(b.id));
          issues.push({
            id: `door:${op.id}`,
            code: "doorBlocked",
            severity: "error",
            itemIds: blockers.map((b) => b.id),
            openingIds: [op.id],
            params: { a: blockers[0].id, more: blockers.length - 1, deg: maxAngle },
            marker: { kind: "polygon", points: sector },
          });
        }
      }
      // ...and the strip just inside the doorway, which you walk through either way.
      const zone = zoneInFront(room, op, DOORWAY_ZONE);
      if (zone) {
        for (const it of solid) {
          if (doorBlockers.has(it.id) || satOverlap(zone, F(it)) <= EPS) continue;
          issues.push({
            id: `doorway:${op.id}:${it.id}`,
            code: "doorwayBlocked",
            severity: "error",
            itemIds: [it.id],
            openingIds: [op.id],
            params: { a: it.id },
            marker: { kind: "polygon", points: zone },
          });
        }
      }
    }

    // 5. Windows: something taller than the sill standing right in front of it.
    if (op.kind === "window") {
      const zone = zoneInFront(room, op, WINDOW_ZONE);
      if (!zone) continue;
      for (const it of solid) {
        if (it.height <= op.sillHeight + 1 || satOverlap(zone, F(it)) <= EPS) continue;
        issues.push({
          id: `window:${op.id}:${it.id}`,
          code: "windowCovered",
          severity: "warning",
          itemIds: [it.id],
          openingIds: [op.id],
          params: { a: it.id, cm: r(Math.min(it.height, op.sillHeight + op.height) - op.sillHeight) },
          marker: { kind: "polygon", points: zone },
        });
      }
    }

    // 6. Radiators: anything in the warm-air zone in front of it.
    if (op.kind === "radiator") {
      const zone = zoneInFront(room, op, RADIATOR_ZONE);
      if (!zone) continue;
      for (const it of solid) {
        if (satOverlap(zone, F(it)) <= EPS) continue;
        issues.push({
          id: `radiator:${op.id}:${it.id}`,
          code: "radiatorBlocked",
          severity: "warning",
          itemIds: [it.id],
          openingIds: [op.id],
          params: { a: it.id },
          marker: { kind: "polygon", points: zone },
        });
      }
    }

    // 7. Outlets: covered by something taller than the outlet, pushed against the wall.
    if (op.kind === "outlet") {
      const zone = zoneInFront(room, op, OUTLET_ZONE, 0, 20);
      if (!zone) continue;
      for (const it of solid) {
        if (it.height <= op.sillHeight || satOverlap(zone, F(it)) <= EPS) continue;
        issues.push({
          id: `outlet:${op.id}:${it.id}`,
          code: "outletCovered",
          severity: "info",
          itemIds: [it.id],
          openingIds: [op.id],
          params: { a: it.id },
          marker: { kind: "polygon", points: zone },
        });
      }
    }
  }

  // 4. Front clearance (wardrobe doors, drawers, desk chair).
  for (const it of placed) {
    const need = it.clearance.front;
    if (need <= 0 || outside.has(it.id)) continue;
    const obstacles = solid.filter((o) => o.id !== it.id && !tucksUnder(o, it));
    // The zone is inset 1 cm at the sides so a neighbour standing flush beside
    // the wardrobe doesn't count as "in front of" it.
    const hits = (depth: number) => {
      const zone = frontZone(it, depth, 1);
      const wall = !convexInsidePolygon(zone, outline, EPS);
      const by = obstacles.filter((o) => satOverlap(zone, F(o)) > EPS);
      return { wall, by, blocked: wall || by.length > 0 };
    };
    const full = hits(need);
    if (!full.blocked) continue;
    // Binary search for how deep the free space actually is.
    let lo = 0, hi = need;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      if (hits(mid).blocked) hi = mid;
      else lo = mid;
    }
    const nearest = hits(hi + 0.5);
    const byWall = nearest.wall && nearest.by.length === 0;
    issues.push({
      id: `clearance:${it.id}`,
      code: "clearanceBlocked",
      severity: lo < need * 0.5 ? "error" : "warning",
      itemIds: [it.id, ...full.by.map((b) => b.id)],
      openingIds: [],
      params: byWall
        ? { a: it.id, cm: r(lo), need, variant: "wall" }
        : { a: it.id, b: (nearest.by[0] ?? full.by[0]).id, cm: r(lo), need },
      marker: { kind: "polygon", points: frontZone(it, need) },
    });
  }

  // 8. Walkways: gaps between furniture, or furniture and a wall, that are
  // wide enough that you'd try to walk through them but too narrow to be
  // comfortable. A gap only counts when nothing else fills it.
  const walkSeverity = (d: number): Severity | null =>
    d < opts.walkwayIgnoreBelow || d >= opts.walkwayWarn ? null : d < opts.walkwayError ? "error" : "warning";
  // A gap only counts when you can walk *through* it: nothing else fills it,
  // and both ends open onto free floor. A 50 cm pocket between a nightstand
  // and the side wall is a dead end, not a walkway, so it's ignored.
  const isThroughGap = (shapeA: Polygon, shapeB: Polygon, cp: { p: Vec2; q: Vec2 }, exclude: string[]) => {
    const { p, q } = cp;
    const mid = lerp(p, q, 0.5);
    if (!pointInPolygon(mid, outline)) return false;
    const n = norm(sub(q, p));
    const side = scale(perp(n), 5);
    const corridor = [add(p, side), add(q, side), sub(q, side), sub(p, side)];
    if (solid.some((o) => !exclude.includes(o.id) && satOverlap(corridor, F(o)) > 0)) return false;
    // Where does the corridor start and end, measured along its length?
    const t = perp(n);
    const span = (poly: Polygon) => {
      let lo = Infinity, hi = -Infinity;
      for (const c of poly) { const d = dot(c, t); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      return [lo, hi];
    };
    const [aLo, aHi] = span(shapeA), [bLo, bHi] = span(shapeB);
    let lo = Math.max(aLo, bLo), hi = Math.min(aHi, bHi);
    if (lo > hi) lo = hi = dot(mid, t); // corner to corner
    const m0 = dot(mid, t);
    const free = (e: Vec2) => pointInPolygon(e, outline) && !solid.some((o) => pointInPolygon(e, F(o)));
    return free(add(mid, scale(t, lo - 25 - m0))) && free(add(mid, scale(t, hi + 25 - m0)));
  };
  const inRoom = solid.filter((i) => !outside.has(i.id));
  for (let i = 0; i < inRoom.length; i++) {
    for (let j = i + 1; j < inRoom.length; j++) {
      const a = inRoom[i], b = inRoom[j];
      if (tucksUnder(a, b) || tucksUnder(b, a)) continue;
      if (satOverlap(F(a), F(b)) > -0.01) continue; // touching or overlapping
      const cp = closestBetween(F(a), F(b));
      const sev = walkSeverity(cp.distance);
      if (!sev || !isThroughGap(F(a), F(b), cp, [a.id, b.id])) continue;
      issues.push({
        id: `walk:${a.id}:${b.id}`,
        code: "walkwayNarrow",
        severity: sev,
        itemIds: [a.id, b.id],
        openingIds: [],
        params: { a: a.id, b: b.id, cm: r(cp.distance) },
        marker: { kind: "line", points: [cp.p, cp.q] },
      });
    }
  }
  for (const it of inRoom) {
    for (const w of getWalls(room)) {
      const cp = closestBetween(F(it), [w.a, w.b]);
      const sev = walkSeverity(cp.distance);
      if (!sev || !isThroughGap(F(it), [w.a, w.b], cp, [it.id])) continue;
      issues.push({
        id: `walkwall:${it.id}:${w.index}`,
        code: "walkwayNarrow",
        severity: sev,
        itemIds: [it.id],
        openingIds: [],
        params: { a: it.id, wall: w.index + 1, cm: r(cp.distance), variant: "wall" },
        marker: { kind: "line", points: [cp.p, cp.q] },
      });
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((x, y) => order[x.severity] - order[y.severity]);
}

export const PENALTY: Record<Severity, number> = { error: 15, warning: 6, info: 2 };

/** 100 minus a fixed penalty per issue: 15 per error, 6 per warning, 2 per note. */
export function scoreFor(issues: Issue[]): number {
  return Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));
}

// Checks run on every drag frame and for every layout tab; cache by the
// (immutable) items array so unchanged layouts cost nothing.
const cache = new WeakMap<FurnitureItem[], { room: Room; issues: Issue[] }>();
export function checksFor(room: Room, items: FurnitureItem[]): Issue[] {
  const hit = cache.get(items);
  if (hit && hit.room === room) return hit.issues;
  const issues = runChecks(room, items);
  cache.set(items, { room, issues });
  return issues;
}
