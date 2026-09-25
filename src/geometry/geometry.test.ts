import { describe, expect, it } from "vitest";
import { convexInsidePolygon, satOverlap, closestBetween, rayToPolygon } from "./polygon";
import { footprint } from "./items";
import { doorGeometry, getWalls, remapOpenings } from "./room";
import { makeOpening, makeRoom } from "../model/factory";
import { runChecks } from "../checks";
import { itemFromPreset } from "../model/factory";
import { PRESET_BY_ID } from "../model/catalog";

const box = (x: number, y: number, width: number, depth: number, rotation = 0) => ({ x, y, width, depth, rotation });

describe("SAT overlap", () => {
  it("separates boxes whose bounding boxes overlap but shapes don't (rotation)", () => {
    // Two 100×20 planks rotated 45°, side by side diagonally: their axis-aligned
    // bounding boxes overlap a lot, but the planks themselves are 5 cm apart.
    const a = footprint(box(0, 0, 100, 20, 45));
    const b = footprint(box(0 + 25 * Math.SQRT2 / 2 * 2, -25 * Math.SQRT2 / 2 * 2, 100, 20, 45));
    expect(satOverlap(a, b)).toBeLessThan(0);
  });
  it("reports penetration depth for axis-aligned boxes", () => {
    expect(satOverlap(footprint(box(0, 0, 100, 100)), footprint(box(90, 0, 100, 100)))).toBeCloseTo(10);
  });
  it("detects a rotated box poking into another", () => {
    // A 50 cm square turned 45° reaches 35.4 cm from its centre: at x=80 its
    // tip is at 44.6, i.e. 5.4 cm into a box that ends at x=50.
    expect(satOverlap(footprint(box(0, 0, 100, 100)), footprint(box(80, 0, 50, 50, 45)))).toBeCloseTo(50 - (80 - 25 * Math.SQRT2), 1);
    expect(satOverlap(footprint(box(0, 0, 100, 100)), footprint(box(90, 0, 50, 50, 45)))).toBeLessThan(0);
  });
});

describe("room containment", () => {
  const L = makeRoom({ kind: "L", width: 400, depth: 400, cutWidth: 200, cutDepth: 200 });
  it("accepts a box inside the L", () => {
    expect(convexInsidePolygon(footprint(box(100, 300, 100, 100)), L.outline)).toBe(true);
  });
  it("rejects a box straddling the inner corner even though all its corners are inside", () => {
    // corners (150..250, 150..250) — (150,150) and others: (250,150) is in the cut-out
    expect(convexInsidePolygon(footprint(box(200, 200, 100, 100)), L.outline)).toBe(false);
  });
  it("accepts a box flush against walls", () => {
    expect(convexInsidePolygon(footprint(box(50, 350, 100, 100)), L.outline)).toBe(true);
  });
  it("finds inner corners of an L", () => {
    const walls = getWalls(L);
    expect(walls.filter((w) => !w.convexA).map((w) => w.index)).toEqual([2]);
  });
});

describe("distances", () => {
  it("measures gap between boxes and ray to walls", () => {
    const d = closestBetween(footprint(box(0, 0, 100, 100)), footprint(box(200, 0, 100, 100)));
    expect(d.distance).toBeCloseTo(100);
    const room = makeRoom({ kind: "rect", width: 300, depth: 200 });
    expect(rayToPolygon({ x: 100, y: 100 }, { x: 1, y: 0 }, room.outline)).toBeCloseTo(200);
  });
});

describe("doors", () => {
  const room = makeRoom({ kind: "rect", width: 300, depth: 300 });
  it("puts the hinge on the right as seen from inside, facing the door", () => {
    // Door in the bottom wall (wall 2 runs right→left). Inside, facing the
    // bottom wall, your right hand points to screen-left (smaller x).
    const right = doorGeometry(room, makeOpening("door", 2, 100, { hinge: "right" }))!;
    const left = doorGeometry(room, makeOpening("door", 2, 100, { hinge: "left" }))!;
    expect(right.hinge.x).toBeLessThan(left.hinge.x);
    expect(right.openDir.y).toBeLessThan(0); // swings into the room (up the screen)
  });
  it("flags furniture in the door swing and reports how far the door opens", () => {
    const door = makeOpening("door", 2, 100, { hinge: "left" }); // hinge at x=200
    const r = makeRoom({ kind: "rect", width: 300, depth: 300 }, [door]);
    const blocker = itemFromPreset(PRESET_BY_ID["nightstand"], 150, 240); // centre of the swing
    const issues = runChecks(r, [blocker]);
    const d = issues.find((i) => i.code === "doorBlocked");
    expect(d).toBeTruthy();
    expect(Number(d!.params.deg)).toBeLessThan(90);
  });
});

describe("clearance", () => {
  it("measures free space in front of a wardrobe", () => {
    const r = makeRoom({ kind: "rect", width: 400, depth: 400 });
    const wardrobe = itemFromPreset(PRESET_BY_ID["wardrobe"], 200, 30); // front faces +y, face at y=60
    const bed = itemFromPreset(PRESET_BY_ID["bed-br-casal"], 200, 90 + 94); // bed top edge at y=90
    const issue = runChecks(r, [wardrobe, bed]).find((i) => i.code === "clearanceBlocked");
    expect(issue?.params.cm).toBe(30);
    expect(issue?.severity).toBe("warning");
  });
});

describe("changing the room shape", () => {
  it("keeps a door on the bottom wall when a rectangle becomes an L", () => {
    const door = makeOpening("door", 2, 30); // bottom wall of the rectangle
    const rect = makeRoom({ kind: "rect", width: 360, depth: 320 }, [door]);
    const L = makeRoom({ kind: "L", width: 360, depth: 320, cutWidth: 140, cutDepth: 120 });
    const [moved] = remapOpenings(rect, L);
    const wall = getWalls(L)[moved.wall];
    expect(wall.a.y).toBe(320);
    expect(wall.b.y).toBe(320);
    expect(moved.offset).toBe(30); // both walls start at the bottom-right corner
  });
  it("moves a right-wall window down by the cut-out depth", () => {
    const win = makeOpening("window", 1, 200); // right wall, 200 cm from the top
    const rect = makeRoom({ kind: "rect", width: 360, depth: 320 }, [win]);
    const L = makeRoom({ kind: "L", width: 360, depth: 320, cutWidth: 140, cutDepth: 120 });
    const [moved] = remapOpenings(rect, L);
    expect(moved.wall).toBe(3);
    expect(moved.offset).toBe(80);
  });
});
