import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Opening, Room } from "../model/types";
import { doorGeometry, getWalls, openingSpan, type Wall } from "../geometry/room";
import { BOX, BOX_EDGES, CUTAWAY, LINE_ISSUE, floorTexture, mat } from "./materials";

const WALL = "#f1ede6";
const CAP = "#5b5750";
const FRAME = "#fbfaf7";
const CEILING = new THREE.MeshStandardMaterial({ color: "#f7f5f0", roughness: 0.95, side: THREE.BackSide, shadowSide: THREE.DoubleSide });
/** Ceiling seen from outside: invisible, but it still blocks the sun so light only enters through windows. */
const CEILING_HIDDEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide });
const GHOST = new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, depthWrite: false });
const GLASS = new THREE.MeshStandardMaterial({
  color: "#cfe3ef",
  transparent: true,
  opacity: 0.16,
  roughness: 0.05,
  metalness: 0.1,
  depthWrite: false,
});

interface Props {
  room: Room;
  /** 0–90° door opening from the slider. */
  doorAngle: number;
  /** Per-door limit when furniture is in the way (from the checks). */
  doorLimits: Record<string, number>;
  blinds: number;
  evening: boolean;
  /** Hide walls between the camera and the room (not in walk mode). */
  cutaway: boolean;
  highlightOpeningIds: string[];
}

type V3 = [number, number, number];

export const RoomMesh = memo(function RoomMesh(props: Props) {
  const { room, cutaway } = props;
  const walls = getWalls(room);
  const H = room.ceilingHeight / 100;
  const T = room.wallThickness / 100;

  const floorGeo = useMemo(() => {
    const shape = new THREE.Shape(room.outline.map((p) => new THREE.Vector2(p.x / 100, -p.y / 100)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); // lay it flat: shape (x, -y) → world (x, 0, y)
    // UVs in metres so the plank texture has a real-world scale (1 tile ≈ 1.6 m).
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 1.6;
      uv[i * 2 + 1] = pos.getZ(i) / 1.6;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }, [room.outline]);
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.72 }), []);

  // Per-wall groups so we can hide the ones facing the camera each frame.
  const wallRefs = useRef<(THREE.Group | null)[]>([]);
  const decoRefs = useRef<(THREE.Group | null)[]>([]);
  const leafRefs = useRef<(THREE.Group | null)[]>([]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    walls.forEach((w, i) => {
      const g = wallRefs.current[i];
      if (!g) return;
      const mx = (w.a.x + w.b.x) / 200, mz = (w.a.y + w.b.y) / 200;
      tmp.set(camera.position.x - mx, 0, camera.position.z - mz);
      const outside = -(tmp.x * w.inward.x + tmp.z * w.inward.y) > 0.05;
      const cut = cutaway && outside;
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = cut ? CUTAWAY : o.userData.mat;
      });
      const deco = decoRefs.current[i];
      if (deco) deco.visible = !cut;
      // A door on a hidden wall turns see-through instead of vanishing, so
      // the door slider still shows something without blocking the view.
      leafRefs.current[i]?.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = cut ? GHOST : o.userData.mat;
      });
    });
  });

  return (
    <group>
      <mesh geometry={floorGeo} material={floorMat} receiveShadow />
      <mesh geometry={floorGeo} material={cutaway ? CEILING_HIDDEN : CEILING} position={[0, H, 0]} castShadow receiveShadow={!cutaway} />
      {walls.map((w, i) => (
        <WallBlock
          key={i}
          wall={w}
          H={H}
          T={T}
          wallRef={(g) => (wallRefs.current[i] = g)}
          decoRef={(g) => (decoRefs.current[i] = g)}
          leafRef={(g) => (leafRefs.current[i] = g)}
          {...props}
        />
      ))}
    </group>
  );
});

interface WallProps extends Props {
  wall: Wall;
  H: number;
  T: number;
  wallRef: (g: THREE.Group | null) => void;
  decoRef: (g: THREE.Group | null) => void;
  leafRef: (g: THREE.Group | null) => void;
}

function WallBlock({ wall, room, H, T, wallRef, decoRef, leafRef, doorAngle, doorLimits, blinds, evening, highlightOpeningIds }: WallProps) {
  const L = wall.length / 100;
  // Wall-local frame: +x along the wall from its start corner, +z = `side`
  // into the room, y up. The wall solid sits just outside the floor outline.
  const phi = Math.atan2(-wall.dir.y, wall.dir.x);
  const side = wall.inward.x * -wall.dir.y + wall.inward.y * wall.dir.x > 0 ? 1 : -1;
  const zMid = -side * (T / 2);
  const extA = wall.convexA ? T : 0;
  const extB = wall.convexB ? T : 0;

  const openings = room.openings
    .filter((o) => o.wall === wall.index && (o.kind === "door" || o.kind === "window"))
    .map((o) => ({ o, span: openingSpan(room, o)! }))
    .filter((x) => x.span && x.span.to > x.span.from)
    .sort((a, b) => a.span.from - b.span.from);

  const pieces: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let cursor = -extA;
  for (const { o, span } of openings) {
    const from = span.from / 100, to = span.to / 100;
    if (from > cursor) pieces.push({ x0: cursor, x1: from, y0: 0, y1: H });
    const top = Math.min(H, (o.sillHeight + o.height) / 100);
    if (o.kind === "window" && o.sillHeight > 0) pieces.push({ x0: from, x1: to, y0: 0, y1: o.sillHeight / 100 });
    if (top < H) pieces.push({ x0: from, x1: to, y0: top, y1: H });
    cursor = Math.max(cursor, to);
  }
  if (cursor < L + extB) pieces.push({ x0: cursor, x1: L + extB, y0: 0, y1: H });

  const wallMat = mat(WALL, { roughness: 0.92 });
  const capMat = mat(CAP, { roughness: 0.9 });

  return (
    <>
      <group position={[wall.a.x / 100, 0, wall.a.y / 100]} rotation={[0, phi, 0]} ref={wallRef}>
        {pieces.map((p, i) => (
          <mesh
            key={i}
            geometry={BOX}
            material={wallMat}
            userData={{ mat: wallMat }}
            position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, zMid]}
            scale={[p.x1 - p.x0, p.y1 - p.y0, T]}
            castShadow
            receiveShadow
          />
        ))}
        {pieces
          .filter((p) => p.y1 >= H - 1e-6)
          .map((p, i) => (
            <mesh key={`c${i}`} geometry={BOX} material={capMat} userData={{ mat: capMat }} position={[(p.x0 + p.x1) / 2, H + 0.003, zMid]} scale={[p.x1 - p.x0, 0.006, T]} />
          ))}
      </group>
      <group position={[wall.a.x / 100, 0, wall.a.y / 100]} rotation={[0, phi, 0]}>
        <group ref={decoRef}>
          {openings
            .filter((x) => x.o.kind === "window")
            .map(({ o, span }) => (
              <WindowFrame key={o.id} o={o} from={span.from / 100} to={span.to / 100} T={T} side={side} blinds={blinds} evening={evening} />
            ))}
          {openings
            .filter((x) => x.o.kind === "door")
            .map(({ o, span }) => (
              <DoorFrame key={o.id} o={o} from={span.from / 100} to={span.to / 100} T={T} zMid={zMid} />
            ))}
        </group>
        {room.openings
          .filter((o) => o.wall === wall.index && (o.kind === "radiator" || o.kind === "outlet"))
          .map((o) => {
            const span = openingSpan(room, o);
            if (!span) return null;
            return o.kind === "radiator" ? (
              <Radiator key={o.id} o={o} from={span.from / 100} to={span.to / 100} side={side} />
            ) : (
              <Outlet key={o.id} o={o} mid={(span.from + span.to) / 200} side={side} />
            );
          })}
        {room.openings
          .filter((o) => o.wall === wall.index && highlightOpeningIds.includes(o.id))
          .map((o) => {
            const span = openingSpan(room, o);
            if (!span) return null;
            const w = (span.to - span.from) / 100;
            const h = Math.max(0.08, o.height / 100);
            return (
              <lineSegments
                key={`hl${o.id}`}
                geometry={BOX_EDGES}
                material={LINE_ISSUE}
                position={[(span.from + span.to) / 200, o.sillHeight / 100 + h / 2, side * 0.05]}
                scale={[w + 0.04, h + 0.04, T + 0.12]}
                renderOrder={10}
              />
            );
          })}
      </group>
      <group ref={leafRef}>
        {room.openings
          .filter((o) => o.wall === wall.index && o.kind === "door")
          .map((o) => (
            <DoorLeaf key={o.id} room={room} o={o} angle={Math.min(doorAngle, doorLimits[o.id] ?? 90)} />
          ))}
      </group>
    </>
  );
}

function B({ p, s, c, rough, shadow = true }: { p: V3; s: V3; c: string; rough?: number; shadow?: boolean }) {
  const m = mat(c, { roughness: rough });
  return <mesh geometry={BOX} material={m} userData={{ mat: m }} position={p} scale={s} castShadow={shadow} receiveShadow />;
}

function WindowFrame({ o, from, to, T, side, blinds, evening }: { o: Opening; from: number; to: number; T: number; side: number; blinds: number; evening: boolean }) {
  const w = to - from, x = (from + to) / 2;
  const y0 = o.sillHeight / 100, h = o.height / 100, y1 = y0 + h;
  const z = -side * (T / 2);
  const f = 0.045;
  const blindH = Math.max(0.001, h * blinds);
  return (
    <group>
      <B p={[x, y0 + f / 2, z]} s={[w, f, T * 0.7]} c={FRAME} />
      <B p={[x, y1 - f / 2, z]} s={[w, f, T * 0.7]} c={FRAME} />
      <B p={[from + f / 2, y0 + h / 2, z]} s={[f, h, T * 0.7]} c={FRAME} />
      <B p={[to - f / 2, y0 + h / 2, z]} s={[f, h, T * 0.7]} c={FRAME} />
      {w > 0.9 && <B p={[x, y0 + h / 2, z]} s={[0.035, h - 2 * f, T * 0.5]} c={FRAME} />}
      <mesh geometry={BOX} material={evening ? mat("#20304a", { opacity: 0.55, roughness: 0.1 }) : GLASS} position={[x, y0 + h / 2, z]} scale={[w - 2 * f, h - 2 * f, 0.008]} />
      {/* interior sill ledge */}
      <B p={[x, y0 - 0.015, side * 0.04]} s={[w + 0.1, 0.03, 0.08 + T * 0.2]} c={FRAME} />
      {/* roller blind: box at the top, fabric that comes down with the slider */}
      <B p={[x, y1 + 0.04, side * 0.045]} s={[w + 0.06, 0.08, 0.08]} c="#e9e4da" />
      {blinds > 0.01 && (
        <>
          <B p={[x, y1 - blindH / 2, side * 0.035]} s={[w + 0.02, blindH, 0.012]} c="#efe7d6" rough={1} />
          <B p={[x, y1 - blindH, side * 0.035]} s={[w + 0.03, 0.025, 0.022]} c="#cfc6b4" />
        </>
      )}
    </group>
  );
}

function Radiator({ o, from, to, side }: { o: Opening; from: number; to: number; side: number }) {
  const w = to - from;
  const y0 = o.sillHeight / 100, h = o.height / 100;
  const fins = Math.max(3, Math.floor(w / 0.06));
  return (
    <group>
      <B p={[(from + to) / 2, y0 + h / 2, side * 0.035]} s={[w, h, 0.03]} c="#f4f4f2" rough={0.4} />
      {Array.from({ length: fins }, (_, i) => (
        <B key={i} p={[from + (w * (i + 0.5)) / fins, y0 + h / 2, side * 0.06]} s={[0.022, h - 0.02, 0.03]} c="#f7f7f5" rough={0.4} shadow={false} />
      ))}
      <B p={[from + 0.04, y0 - 0.06, side * 0.03]} s={[0.02, 0.12, 0.02]} c="#dcdcd8" shadow={false} />
    </group>
  );
}

function Outlet({ o, mid, side }: { o: Opening; mid: number; side: number }) {
  const y = (o.sillHeight + o.height / 2) / 100;
  return (
    <group>
      <B p={[mid, y, side * 0.005]} s={[0.085, 0.085, 0.01]} c="#fbfbfa" rough={0.4} shadow={false} />
      <B p={[mid - 0.012, y, side * 0.0105]} s={[0.008, 0.008, 0.002]} c="#555" shadow={false} />
      <B p={[mid + 0.012, y, side * 0.0105]} s={[0.008, 0.008, 0.002]} c="#555" shadow={false} />
    </group>
  );
}

function DoorFrame({ o, from, to, T, zMid }: { o: Opening; from: number; to: number; T: number; zMid: number }) {
  const h = o.height / 100;
  const f = 0.05;
  return (
    <group>
      <B p={[from + f / 2, h / 2, zMid]} s={[f, h, T + 0.02]} c={FRAME} />
      <B p={[to - f / 2, h / 2, zMid]} s={[f, h, T + 0.02]} c={FRAME} />
      <B p={[(from + to) / 2, h - f / 2, zMid]} s={[to - from, f, T + 0.02]} c={FRAME} />
    </group>
  );
}

function DoorLeaf({ room, o, angle }: { room: Room; o: Opening; angle: number }) {
  const g = doorGeometry(room, o);
  if (!g) return null;
  const h = o.height / 100 - 0.06;
  const r = g.radius / 100 - 0.1; // minus the two frame jambs
  // Hinge sits just inside the jamb, nudged toward the side the door swings to.
  const hx = g.hinge.x / 100 + g.closedDir.x * 0.05 + g.openDir.x * 0.02;
  const hz = g.hinge.y / 100 + g.closedDir.y * 0.05 + g.openDir.y * 0.02;
  const base = Math.atan2(-g.closedDir.y, g.closedDir.x);
  // A clockwise plan rotation is a negative rotation around three.js's up axis.
  const rotY = base - (g.sign * angle * Math.PI) / 180;
  return (
    <group position={[hx, 0, hz]} rotation={[0, rotY, 0]}>
      <B p={[r / 2, h / 2 + 0.01, 0]} s={[r, h, 0.04]} c="#f7f4ee" rough={0.6} />
      <B p={[r - 0.07, 1.0, 0.035]} s={[0.12, 0.018, 0.018]} c="#8d9197" rough={0.3} />
      <B p={[r - 0.07, 1.0, -0.035]} s={[0.12, 0.018, 0.018]} c="#8d9197" rough={0.3} />
    </group>
  );
}
