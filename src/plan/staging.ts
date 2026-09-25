import type { FurnitureItem, Room, Vec2 } from "../model/types";
import { bounds } from "../geometry/polygon";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Staging {
  zone: Rect;
  /** Where each staged item is drawn (their own x/y are ignored while staged). */
  positions: Map<string, Vec2>;
}

const GAP_FROM_ROOM = 90; // leaves room for the wall labels on the right side
const PAD = 18;
const TITLE = 34;

/**
 * The "outside the room" area, with staged items packed in rows. It goes to
 * the right of the room in a wide pane and below it in a tall one, so it
 * doesn't shrink the room more than necessary.
 */
export function stagingLayout(room: Room, items: FurnitureItem[], exclude: string | null, placement: "right" | "below"): Staging {
  const b = bounds(room.outline);
  const staged = items.filter((i) => i.staged && i.id !== exclude);
  const widest = staged.reduce((m, i) => Math.max(m, i.width), 0);
  const w = placement === "below" ? Math.max(b.w, widest + PAD * 2) : Math.max(staged.length ? 250 : 160, widest + PAD * 2);
  const x0 = placement === "below" ? b.minX : b.maxX + GAP_FROM_ROOM;
  const y0 = placement === "below" ? b.maxY + GAP_FROM_ROOM : b.minY;
  const positions = new Map<string, Vec2>();
  let cx = x0 + PAD, cy = y0 + TITLE, rowH = 0;
  for (const it of staged) {
    if (cx + it.width > x0 + w - PAD + 0.1 && cx > x0 + PAD) {
      cx = x0 + PAD;
      cy += rowH + PAD;
      rowH = 0;
    }
    positions.set(it.id, { x: cx + it.width / 2, y: cy + it.depth / 2 });
    cx += it.width + PAD;
    rowH = Math.max(rowH, it.depth);
  }
  const packed = cy + rowH + PAD - y0;
  const h = placement === "below" ? Math.max(staged.length ? 0 : 80, packed) : Math.max(b.h, packed);
  return { zone: { x: x0, y: y0, w, h }, positions };
}

export function inRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
