// The data model. Everything is stored in centimetres, in a top-down plan
// coordinate system: +x to the right, +y DOWN the screen (the same way SVG
// works), so the plan can use these numbers directly. Rotations are in
// degrees, clockwise as seen on the plan.
//
// Designed so v2 (LiDAR import, auto-suggested layouts) can plug in without a
// rewrite:
// - Room is a free polygon, not a width/height pair. `shape` only remembers how
//   the polygon was generated so the editor can show friendly inputs; a scan
//   import would simply produce `{ kind: "polygon" }`.
// - Openings point at a wall by index into the polygon's edges, plus an
//   offset along that wall. A scanner that detects a gap in a wall produces
//   exactly this.
// - Furniture is an oriented box. Detected clusters from a scan become the
//   same boxes, and an optimiser only has to change x / y / rotation.

export const SCHEMA_VERSION = 1;

export interface Vec2 {
  x: number;
  y: number;
}

/** v2 will add "switch" | "vent". */
export type OpeningKind = "door" | "window" | "radiator" | "outlet";

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Index of the wall: wall i runs from outline[i] to outline[i + 1]. */
  wall: number;
  /** Distance from the wall's start corner to the near edge of the opening. */
  offset: number;
  width: number;
  /** Height of the bottom edge above the floor (0 for doors). */
  sillHeight: number;
  height: number;
  /** Doors only. Left/right as seen standing inside the room, facing the door. */
  hinge?: "left" | "right";
  /** Doors only. */
  swing?: "in" | "out";
}

export type RoomShape =
  | { kind: "rect"; width: number; depth: number }
  /** An L: a width × depth rectangle with the top-right corner cut out. */
  | { kind: "L"; width: number; depth: number; cutWidth: number; cutDepth: number }
  /** Arbitrary outline (future: scan import, click-to-draw). */
  | { kind: "polygon" };

export interface Room {
  /** Interior floor outline (inside face of the walls), no repeated last point. */
  outline: Vec2[];
  shape: RoomShape;
  ceilingHeight: number;
  wallThickness: number;
  openings: Opening[];
}

export type Category =
  | "bed"
  | "wardrobe"
  | "dresser"
  | "desk"
  | "chair"
  | "nightstand"
  | "shelf"
  | "sofa"
  | "rug"
  | "other";

export interface Clearance {
  /** Free space needed in front of the item (doors, drawers, a chair...). */
  front: number;
  // v2: `sides` for bed access.
}

export interface FurnitureItem {
  id: string;
  category: Category;
  /** Catalog preset it came from; its translated name is used unless `name` is set. */
  presetId?: string;
  /** User-given name. Overrides the preset name. */
  name?: string;
  /** Centre of the footprint. */
  x: number;
  y: number;
  /** Size along the item's own left-right axis. */
  width: number;
  /** Size along the item's own back-front axis. The front faces local +y. */
  depth: number;
  /** Degrees, clockwise on the plan. */
  rotation: number;
  height: number;
  clearance: Clearance;
  color: string;
  /** In the "outside the room" staging area: not placed, ignored by checks and 3D. */
  staged: boolean;
}

export interface Layout {
  id: string;
  name: string;
  notes: string;
  items: FurnitureItem[];
}

export interface Project {
  schemaVersion: number;
  name: string;
  room: Room;
  layouts: Layout[];
  activeLayoutId: string;
  recommendedLayoutId: string | null;
}

export type Severity = "error" | "warning" | "info";

export type IssueCode =
  | "overlap"
  | "outsideRoom"
  | "doorBlocked"
  | "doorwayBlocked"
  | "clearanceBlocked"
  | "windowCovered"
  | "radiatorBlocked"
  | "outletCovered"
  | "walkwayNarrow";

export interface Issue {
  /** Stable across re-runs so the UI can keep an issue selected while you drag. */
  id: string;
  code: IssueCode;
  severity: Severity;
  itemIds: string[];
  openingIds: string[];
  /** Values for the message template. Keys `a` / `b` hold item ids. */
  params: Record<string, string | number>;
  /** Optional shape to draw on the plan when the issue is selected (cm). */
  marker?: { kind: "line" | "polygon"; points: Vec2[] };
}
