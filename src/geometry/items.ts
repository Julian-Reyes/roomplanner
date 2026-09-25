import type { FurnitureItem, Vec2 } from "../model/types";
import { FLAT_HEIGHT } from "../model/catalog";
import { add, rotate, v } from "./vec";
import type { Polygon } from "./polygon";

type Box = Pick<FurnitureItem, "x" | "y" | "width" | "depth" | "rotation">;

/** Item-local point (x across the width, y from back (-) to front (+)) → plan coordinates. */
export function toWorld(item: Box, local: Vec2): Vec2 {
  return add(v(item.x, item.y), rotate(local, item.rotation));
}

/** Rectangle given in item-local coordinates → plan polygon. */
export function localRect(item: Box, x0: number, y0: number, x1: number, y1: number): Polygon {
  return [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)].map((p) => toWorld(item, p));
}

/** The item's footprint: its four rotated corners. */
export function footprint(item: Box): Polygon {
  const hw = item.width / 2, hd = item.depth / 2;
  return localRect(item, -hw, -hd, hw, hd);
}

/**
 * The dashed "front clearance" zone: a strip in front of the item as wide as
 * the item and `depth` deep (defaults to the item's own requirement).
 */
export function frontZone(item: FurnitureItem, depth = item.clearance.front, inset = 0): Polygon {
  const hw = item.width / 2 - inset, hd = item.depth / 2;
  return localRect(item, -hw, hd, hw, hd + depth);
}

/** Flat things (rugs) don't collide: you can stand on them and put furniture on them. */
export function isFlat(item: FurnitureItem): boolean {
  return item.category === "rug" || item.height <= FLAT_HEIGHT;
}

/** Chairs are meant to tuck under desks and stand in the desk's clearance zone. */
export function tucksUnder(a: FurnitureItem, b: FurnitureItem): boolean {
  return a.category === "chair" && b.category === "desk";
}
