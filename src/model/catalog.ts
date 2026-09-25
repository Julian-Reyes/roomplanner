import type { Category } from "./types";

export interface Preset {
  id: string;
  category: Category;
  group: "bedsBR" | "bedsUS" | "storage" | "work" | "living";
  width: number;
  depth: number;
  height: number;
  front: number;
  color: string;
}

// Brazilian mattress sizes (ABNT-style common sizes) and US mattress sizes.
// Footprints use the mattress size; a real frame adds a few cm.
export const PRESETS: Preset[] = [
  { id: "bed-br-solteiro", category: "bed", group: "bedsBR", width: 88, depth: 188, height: 90, front: 0, color: "#8fa8c8" },
  { id: "bed-br-casal", category: "bed", group: "bedsBR", width: 138, depth: 188, height: 95, front: 0, color: "#8fa8c8" },
  { id: "bed-br-queen", category: "bed", group: "bedsBR", width: 158, depth: 198, height: 100, front: 0, color: "#8fa8c8" },
  { id: "bed-br-king", category: "bed", group: "bedsBR", width: 193, depth: 203, height: 100, front: 0, color: "#8fa8c8" },
  { id: "bed-us-twin", category: "bed", group: "bedsUS", width: 97, depth: 191, height: 90, front: 0, color: "#a9b8a0" },
  { id: "bed-us-full", category: "bed", group: "bedsUS", width: 137, depth: 191, height: 95, front: 0, color: "#a9b8a0" },
  { id: "bed-us-queen", category: "bed", group: "bedsUS", width: 152, depth: 203, height: 100, front: 0, color: "#a9b8a0" },
  { id: "bed-us-king", category: "bed", group: "bedsUS", width: 193, depth: 203, height: 100, front: 0, color: "#a9b8a0" },
  { id: "wardrobe", category: "wardrobe", group: "storage", width: 150, depth: 60, height: 210, front: 55, color: "#d8cfc0" },
  { id: "dresser", category: "dresser", group: "storage", width: 100, depth: 45, height: 80, front: 45, color: "#b88a5e" },
  { id: "nightstand", category: "nightstand", group: "storage", width: 45, depth: 40, height: 55, front: 0, color: "#b88a5e" },
  { id: "shelf", category: "shelf", group: "storage", width: 80, depth: 30, height: 180, front: 0, color: "#e6e0d6" },
  { id: "desk", category: "desk", group: "work", width: 120, depth: 60, height: 75, front: 70, color: "#c9a882" },
  { id: "chair", category: "chair", group: "work", width: 45, depth: 50, height: 90, front: 0, color: "#4b5563" },
  { id: "sofa", category: "sofa", group: "living", width: 200, depth: 90, height: 85, front: 0, color: "#7c8a9e" },
  { id: "rug", category: "rug", group: "living", width: 200, depth: 140, height: 1, front: 0, color: "#c7a17a" },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export const CATEGORIES: Category[] = [
  "bed", "wardrobe", "dresser", "desk", "chair", "nightstand", "shelf", "sofa", "rug", "other",
];

/** Items this low are "flat" (rugs, mats): you can walk on them and put things on them. */
export const FLAT_HEIGHT = 3;
