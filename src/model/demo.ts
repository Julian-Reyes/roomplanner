import { PRESET_BY_ID } from "./catalog";
import { itemFromPreset, makeOpening, makeRoom } from "./factory";
import { SCHEMA_VERSION, type FurnitureItem, type Layout, type Project } from "./types";

// A synthetic 3.6 × 3.2 m bedroom. Walls are numbered clockwise from the top:
// 1 = top (window + radiator), 2 = right, 3 = bottom (door), 4 = left.
// (Stored 0-based; the UI shows them 1-based.)

function item(presetId: string, x: number, y: number, rotation: number, patch: Partial<FurnitureItem> = {}) {
  return itemFromPreset(PRESET_BY_ID[presetId], x, y, { rotation, ...patch });
}

export function makeDemoProject(): Project {
  const room = makeRoom({ kind: "rect", width: 360, depth: 320 }, [
    makeOpening("door", 2, 30, { hinge: "left", swing: "in", id: "door" }),
    makeOpening("window", 0, 110, { width: 140, sillHeight: 90, height: 130, id: "window" }),
    makeOpening("radiator", 0, 120, { width: 120, id: "radiator" }),
    makeOpening("outlet", 0, 50, { id: "outlet1" }),
    makeOpening("outlet", 1, 250, { id: "outlet2" }),
    makeOpening("outlet", 3, 250, { id: "outlet3" }),
  ]);

  // "Current": how the room is today. Bed pushed under the window (covers it
  // and the radiator), wardrobe squeezed by the bed, desk behind the door.
  const current: Layout = {
    id: "layout-current",
    name: "Current",
    notes: "",
    items: [
      item("bed-br-queen", 180, 99, 0),
      item("nightstand", 77, 20, 0),
      item("nightstand", 283, 20, 0),
      item("wardrobe", 30, 200, 270),
      item("desk", 330, 225, 90),
      item("chair", 288, 225, 270),
      item("rug", 180, 240, 0, { width: 160, depth: 90 }),
    ],
  };

  // "A": bed moved to the right wall. Better, but a nightstand now sits in the
  // door swing and the dresser's drawers can't open fully.
  const a: Layout = {
    id: "layout-a",
    name: "A",
    notes: "",
    items: [
      item("bed-br-queen", 261, 125, 90),
      item("nightstand", 340, 23, 90),
      item("nightstand", 340, 226, 90),
      item("wardrobe", 30, 180, 270),
      item("desk", 55, 30, 0, { width: 100 }),
      item("chair", 55, 72, 180),
      item("dresser", 150, 297, 180),
    ],
  };

  // "B": bed in the corner away from the window, wardrobe beside the window,
  // desk on the other side. Everything opens freely.
  const b: Layout = {
    id: "layout-b",
    name: "B",
    notes: "",
    items: [
      item("bed-br-queen", 99, 241, 270),
      item("nightstand", 20, 139, 270),
      item("wardrobe", 55, 30, 0, { width: 110 }),
      item("desk", 305, 30, 0, { width: 100 }),
      item("chair", 305, 65, 180),
      item("dresser", 337.5, 195, 90, { width: 90 }),
      item("rug", 250, 215, 90, { width: 140, depth: 100 }),
    ],
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Demo bedroom",
    room,
    layouts: [current, a, b],
    activeLayoutId: current.id,
    recommendedLayoutId: b.id,
  };
}
