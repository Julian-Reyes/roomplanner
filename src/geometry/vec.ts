import type { Vec2 } from "../model/types";

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** 90° turn. With +y pointing down (plan coordinates) this turns clockwise on screen. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const DEG = Math.PI / 180;

/** Rotates by `deg` degrees, clockwise on the plan (because +y points down). */
export function rotate(a: Vec2, deg: number): Vec2 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function normAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}
