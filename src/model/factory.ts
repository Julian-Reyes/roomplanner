import type { FurnitureItem, Opening, OpeningKind, Room, RoomShape, Vec2 } from "./types";
import type { Preset } from "./catalog";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Builds the floor outline for a rectangle or L shape. Walls are numbered from the top-left corner, clockwise. */
export function outlineForShape(shape: RoomShape, fallback: Vec2[] = []): Vec2[] {
  if (shape.kind === "rect") {
    const { width: w, depth: d } = shape;
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
  }
  if (shape.kind === "L") {
    const { width: w, depth: d, cutWidth: cw, cutDepth: cd } = shape;
    return [
      { x: 0, y: 0 },
      { x: w - cw, y: 0 },
      { x: w - cw, y: cd },
      { x: w, y: cd },
      { x: w, y: d },
      { x: 0, y: d },
    ];
  }
  return fallback;
}

export function makeRoom(shape: RoomShape, openings: Opening[] = []): Room {
  return { outline: outlineForShape(shape), shape, ceilingHeight: 260, wallThickness: 12, openings };
}

export const OPENING_DEFAULTS: Record<OpeningKind, Pick<Opening, "width" | "sillHeight" | "height">> = {
  door: { width: 80, sillHeight: 0, height: 210 },
  window: { width: 120, sillHeight: 100, height: 110 },
  radiator: { width: 80, sillHeight: 15, height: 60 },
  outlet: { width: 10, sillHeight: 30, height: 10 },
};

export function makeOpening(kind: OpeningKind, wall: number, offset: number, patch: Partial<Opening> = {}): Opening {
  return {
    id: uid(kind),
    kind,
    wall,
    offset,
    ...OPENING_DEFAULTS[kind],
    ...(kind === "door" ? { hinge: "left" as const, swing: "in" as const } : {}),
    ...patch,
  };
}

export function itemFromPreset(p: Preset, x = 0, y = 0, patch: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: uid("item"),
    category: p.category,
    presetId: p.id,
    x,
    y,
    width: p.width,
    depth: p.depth,
    height: p.height,
    rotation: 0,
    clearance: { front: p.front },
    color: p.color,
    staged: false,
    ...patch,
  };
}
