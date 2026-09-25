# Cabe? — room planner (v1)

A single-page 3D room planner that checks whether furniture fits: 2D plan + synced 3D view, live checks with a 0–100 score, several layouts per room. `docs/FUTURE_SPEC.md` describes the full version (LiDAR import, auto-suggested layouts, AI photo assist). It is gitignored and local-only. **v1 deliberately builds none of that**, but the data model is shaped so v2 can plug in (see below).

## Rules
- **Explain non-obvious decisions in plain language**, in code comments and in replies. Say *why* (e.g. "margins are in pixels because labels are drawn at a fixed pixel size"), not just what.
- **Keep geometry code free of UI code.** `src/geometry/`, `src/checks/` and `src/model/` are pure TypeScript: no React, no three.js, no DOM. UI code calls them, never the other way round.
- **Run the build before saying something works**: `npm run build` (type-check + bundle), plus `npm test` when geometry or checks change. If you can't verify something visually, say so.

## Commands
- `npm install`, then `npm run dev` (Vite, http://localhost:5173)
- `npm run build` → `dist/index.html`, one self-contained file (vite-plugin-singlefile)
- `npm run preview` serves the build (http://localhost:4173)
- `npm test` runs the Vitest unit tests (geometry, checks, demo layouts)

## Units and coordinates
- Everything is stored in **centimetres** in plan coordinates: +x right, **+y down** (same as SVG, so the plan draws the numbers directly). Rotations are degrees, clockwise on the plan.
- An item's own frame: width along local x, depth along local y, **front = local +y**. Clearance zones sit in front.
- 3D uses metres: plan `(x, y)` → three `(x/100, height, y/100)`. A clockwise plan rotation θ is `rotation.y = -θ` in three.js.
- Walls: wall `i` runs from `outline[i]` to `outline[i+1]`. The UI numbers walls from 1.

## Architecture
- `src/model/` holds types (`types.ts`, versioned by `SCHEMA_VERSION`), the furniture catalog (BR + US bed sizes), factories, and the demo bedroom (3 layouts that each trigger different checks; `checks/demo.test.ts` pins that down).
- `src/geometry/` has vectors, polygons (SAT overlap, containment in concave rooms, ray casts), items (footprints, clearance zones), room (walls, door swing, opening zones, remapping openings when the outline changes), and snap (wall/furniture snapping, distances to walls, free-spot search, walk collision).
- `src/checks/`: `runChecks(room, items)` returns `Issue[]` (severity, involved item/opening ids, message params, optional marker shape). `checksFor()` caches by the immutable items array. `scoreFor()` = 100 − 15/error − 6/warning − 2/note.
- `src/state/store.ts` is a Zustand store: project + undo/redo (a drag counts as one undo step via `beginGesture`/`endGesture`), selection, issue highlight, view settings. `persist.ts` handles localStorage autosave, JSON export/import through `migrate()`, and share links (lz-string in `#p=`).
- `src/plan/` is the SVG plan: `PlanView` (pointer handling, pan/zoom/pinch, snapping, live distances, staging area), `PlanRoom`, `PlanItem`.
- `src/three/` is the R3F scene: procedural furniture from one shared unit box (`materials.ts`), room with real wall openings, cutaway walls, camera rig (orbit / top / wall / walk).
- `src/i18n/` has `en.ts` and `pt.ts` (typed so PT can't miss a key). Issue messages are templates filled from `Issue.params`.

## How the key checks work
- **Overlap** uses the Separating Axis Theorem on the real rotated rectangles. Rugs don't collide, and a chair may tuck under a desk.
- **Outside the room**: all corners inside the room, no room corner inside the item, no edges crossing (this catches the inner corner of an L).
- **Door**: furniture overlapping the quarter-circle the door sweeps through. The leaf is then opened 1° at a time to report how far it gets, and the 3D door stops at that angle.
- **Front clearance**: a strip in front of the item as deep as its clearance. A binary search finds how much of it is actually free.
- **Walkway**: gaps of 25–60 cm between furniture, or between furniture and a wall, that you can walk *through* (nothing fills the gap and both ends open onto free floor). Dead-end pockets are ignored. Thresholds are in `DEFAULT_CHECK_OPTIONS`.

## Where v2 plugs in
- A scan import produces a `Room` with `shape: { kind: "polygon" }` and openings as `{ wall, offset, ... }`, plus `FurnitureItem` boxes, all using the same types.
- Auto-suggest only changes `x / y / rotation` and scores with `runChecks` + `scoreFor`. Both are pure and fast enough to call thousands of times.
- New opening kinds (switch, vent) go in `OpeningKind`, and new rules go in `runChecks`. Bump `SCHEMA_VERSION` and add a step to `migrate()` for any stored-shape change.

## Performance budget (target: 2017 Intel MacBook Pro)
- `frameloop="demand"`: the 3D view renders only when something changes. Anything animated must call `invalidate()`.
- Pixel ratio is capped at 1.5, there is **one** shadow-casting light (1024² map), and no post-processing.
- Reuse `BOX` / `CYL` geometries and `mat()` cached materials. Don't create geometries or materials per render.
- Per-frame values (walk position) live outside React (`walkInput`). The plan's walker marker updates via rAF, not state.

## Testing in a real browser
Headless Chrome via `puppeteer-core` (installed outside the repo) with `--use-angle=swiftshader` renders the WebGL view well enough for screenshots and scripted drags.
