import { memo, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { FurnitureItem } from "../model/types";
import { BOX, BOX_EDGES, CYL, LINE_ISSUE, LINE_SELECTED, mat, shade } from "./materials";

type V3 = [number, number, number];

/** One box part: centre position and size in metres, in the item's own frame. */
function B({ p, s, c, rough, metal, shadow = true }: { p: V3; s: V3; c: string; rough?: number; metal?: number; shadow?: boolean }) {
  return (
    <mesh geometry={BOX} material={mat(c, { roughness: rough, metalness: metal })} position={p} scale={s} castShadow={shadow} receiveShadow />
  );
}

function Leg({ p, h, r = 0.02, c }: { p: [number, number]; h: number; r?: number; c: string }) {
  return <mesh geometry={CYL} material={mat(c, { roughness: 0.5, metalness: 0.2 })} position={[p[0], h / 2, p[1]]} scale={[r * 2, h, r * 2]} castShadow />;
}

const WOOD = "#8b6a4e";
const DARK = "#3b3f46";
const METAL = "#9aa0a6";
const LINEN = "#f4f2ee";

interface Props {
  item: FurnitureItem;
  selected: boolean;
  issue: boolean;
  onSelect: (id: string) => void;
}

/**
 * Plan → 3D mapping: plan (x, y) in cm becomes (x/100, 0, y/100) in metres,
 * and a clockwise plan rotation of θ becomes a rotation of -θ around the
 * vertical axis (three.js turns counter-clockwise when viewed from above).
 * Inside the group the item's front is +z, its back is -z.
 */
export const Furniture3D = memo(function Furniture3D({ item, selected, issue, onSelect }: Props) {
  const w = item.width / 100, d = item.depth / 100, h = Math.max(0.01, item.height / 100);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // that was a drag to orbit/look, not a click
    e.stopPropagation();
    onSelect(item.id);
  };
  return (
    <group
      position={[item.x / 100, 0, item.y / 100]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {model(item, w, d, h)}
      {(selected || issue) && (
        <lineSegments
          geometry={BOX_EDGES}
          material={issue ? LINE_ISSUE : LINE_SELECTED}
          position={[0, h / 2, 0]}
          scale={[w + 0.03, h + 0.03, d + 0.03]}
          renderOrder={10}
        />
      )}
    </group>
  );
});

function model(item: FurnitureItem, w: number, d: number, h: number): ReactNode {
  const c = item.color;
  switch (item.category) {
    case "bed":
      return <Bed w={w} d={d} h={h} c={c} />;
    case "wardrobe":
      return <Wardrobe w={w} d={d} h={h} c={c} />;
    case "dresser":
      return <Drawers w={w} d={d} h={h} c={c} legs={false} />;
    case "nightstand":
      return <Drawers w={w} d={d} h={h} c={c} legs />;
    case "desk":
      return <Desk w={w} d={d} h={h} c={c} />;
    case "chair":
      return <Chair w={w} d={d} h={h} c={c} />;
    case "shelf":
      return <Shelf w={w} d={d} h={h} c={c} seed={item.id} />;
    case "sofa":
      return <Sofa w={w} d={d} h={h} c={c} />;
    case "rug":
      return (
        <>
          <mesh geometry={BOX} material={mat(c, { roughness: 1 })} position={[0, 0.004, 0]} scale={[w, 0.008, d]} receiveShadow />
          <mesh geometry={BOX} material={mat(shade(c, 0.25), { roughness: 1 })} position={[0, 0.0085, 0]} scale={[Math.max(0.01, w - 0.14), 0.002, Math.max(0.01, d - 0.14)]} receiveShadow />
        </>
      );
    default:
      return <B p={[0, h / 2, 0]} s={[w, h, d]} c={c} />;
  }
}

interface P {
  w: number;
  d: number;
  h: number;
  c: string;
}

function Bed({ w, d, h, c }: P) {
  const legH = 0.07;
  const baseTop = Math.min(0.3, h * 0.55);
  const mattTop = Math.min(baseTop + 0.24, h);
  const pillows = w >= 1.2 ? 2 : 1;
  const pw = (w - 0.14 - (pillows - 1) * 0.06) / pillows;
  const duvetLen = d * 0.68;
  const duvetZ = d / 2 - duvetLen / 2 + 0.012;
  const hasHead = h > mattTop + 0.08;
  const headD = 0.07;
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Leg key={i} p={[sx * (w / 2 - 0.06), sz * (d / 2 - 0.06)]} h={legH} r={0.025} c={DARK} />
      ))}
      <B p={[0, (legH + baseTop) / 2, 0]} s={[w, baseTop - legH, d]} c={WOOD} />
      <B p={[0, (baseTop + mattTop) / 2, hasHead ? headD / 2 : 0]} s={[w - 0.03, mattTop - baseTop, d - 0.03 - (hasHead ? headD : 0)]} c={LINEN} rough={0.95} />
      {/* duvet: a slab on top plus drops over the sides and foot */}
      <B p={[0, mattTop + 0.02, duvetZ]} s={[w + 0.02, 0.04, duvetLen]} c={c} rough={0.95} />
      <B p={[-(w / 2 + 0.006), mattTop - 0.08, duvetZ]} s={[0.012, 0.2, duvetLen]} c={c} rough={0.95} />
      <B p={[w / 2 + 0.006, mattTop - 0.08, duvetZ]} s={[0.012, 0.2, duvetLen]} c={c} rough={0.95} />
      <B p={[0, mattTop - 0.08, d / 2 + 0.018]} s={[w + 0.024, 0.2, 0.012]} c={c} rough={0.95} />
      {/* folded top edge of the duvet */}
      <B p={[0, mattTop + 0.045, duvetZ - duvetLen / 2 + 0.08]} s={[w + 0.02, 0.03, 0.16]} c={shade(c, 0.35)} rough={0.95} />
      {Array.from({ length: pillows }, (_, i) => (
        <B key={i} p={[-w / 2 + 0.07 + pw / 2 + i * (pw + 0.06), mattTop + 0.055, -d / 2 + headD + 0.2]} s={[pw, 0.11, 0.3]} c="#fbfaf7" rough={0.95} />
      ))}
      {hasHead && <B p={[0, h / 2, -d / 2 + headD / 2]} s={[w + 0.02, h, headD]} c={shade(WOOD, -0.15)} />}
    </>
  );
}

function Wardrobe({ w, d, h, c }: P) {
  const plinth = 0.06;
  const doors = Math.max(2, Math.round(w / 0.5));
  const dw = w / doors;
  const front = d / 2;
  return (
    <>
      <B p={[0, plinth / 2, -0.02]} s={[w - 0.04, plinth, d - 0.06]} c={shade(c, -0.45)} />
      <B p={[0, (h + plinth) / 2, -0.01]} s={[w, h - plinth, d - 0.02]} c={shade(c, -0.18)} />
      {Array.from({ length: doors }, (_, i) => {
        const x = -w / 2 + dw * (i + 0.5);
        // Handles sit on the edges where two doors meet.
        const hx = i % 2 === 0 ? x + dw / 2 - 0.05 : x - dw / 2 + 0.05;
        return (
          <group key={i}>
            <B p={[x, (h + plinth) / 2, front - 0.01]} s={[dw - 0.006, h - plinth - 0.012, 0.02]} c={c} />
            <B p={[hx, h * 0.52, front + 0.01]} s={[0.014, 0.26, 0.02]} c={METAL} rough={0.35} metal={0.6} />
          </group>
        );
      })}
    </>
  );
}

function Drawers({ w, d, h, c, legs }: P & { legs: boolean }) {
  const base = legs ? 0.12 : 0.06;
  const bodyH = h - base;
  const rows = legs ? (bodyH > 0.35 ? 2 : 1) : Math.max(2, Math.round(bodyH / 0.22));
  const cols = w > 1.0 ? 2 : 1;
  const rowH = (bodyH - 0.04) / rows;
  const colW = (w - 0.03) / cols;
  const front = d / 2;
  return (
    <>
      {legs ? (
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
          <Leg key={i} p={[sx * (w / 2 - 0.04), sz * (d / 2 - 0.04)]} h={base} r={0.015} c={shade(c, -0.3)} />
        ))
      ) : (
        <B p={[0, base / 2, -0.02]} s={[w - 0.04, base, d - 0.06]} c={shade(c, -0.45)} />
      )}
      <B p={[0, base + bodyH / 2, -0.01]} s={[w, bodyH, d - 0.02]} c={shade(c, -0.2)} />
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols), col = i % cols;
        const x = -w / 2 + 0.015 + colW * (col + 0.5);
        const y = base + 0.02 + rowH * (r + 0.5);
        return (
          <group key={i}>
            <B p={[x, y, front - 0.01]} s={[colW - 0.01, rowH - 0.012, 0.02]} c={c} />
            <B p={[x, y + rowH * 0.18, front + 0.008]} s={[Math.min(0.14, colW * 0.4), 0.014, 0.018]} c={METAL} rough={0.35} metal={0.6} />
          </group>
        );
      })}
    </>
  );
}

function Desk({ w, d, h, c }: P) {
  const top = 0.03;
  return (
    <>
      <B p={[0, h - top / 2, 0]} s={[w, top, d]} c={c} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <B key={i} p={[sx * (w / 2 - 0.04), (h - top) / 2, sz * (d / 2 - 0.04)]} s={[0.04, h - top, 0.04]} c={DARK} rough={0.5} metal={0.3} />
      ))}
      <B p={[0, h - 0.14, -d / 2 + 0.05]} s={[w - 0.1, 0.18, 0.015]} c={shade(c, -0.15)} />
      {w > 0.6 && d > 0.4 && (
        <group position={[w * 0.12, h, -0.02]}>
          <B p={[0, 0.008, 0.03]} s={[0.32, 0.016, 0.22]} c="#2d3136" rough={0.4} metal={0.4} />
          <group position={[0, 0.016, -0.08]} rotation={[-0.25, 0, 0]}>
            <B p={[0, 0.105, 0]} s={[0.32, 0.21, 0.01]} c="#2d3136" rough={0.4} metal={0.4} />
            <mesh geometry={BOX} material={mat("#6d8fb3", { emissive: "#4a6a90", emissiveIntensity: 0.5, roughness: 0.3 })} position={[0, 0.105, 0.0055]} scale={[0.29, 0.18, 0.001]} />
          </group>
        </group>
      )}
      {w > 0.9 && (
        <group position={[-w / 2 + 0.14, h, -d / 2 + 0.14]}>
          <mesh geometry={CYL} material={mat(DARK)} position={[0, 0.01, 0]} scale={[0.12, 0.02, 0.12]} castShadow />
          <mesh geometry={CYL} material={mat(DARK)} position={[0, 0.2, 0]} scale={[0.016, 0.38, 0.016]} castShadow />
          <mesh geometry={CYL} material={mat("#f2e6cf", { roughness: 0.9 })} position={[0, 0.4, 0]} scale={[0.18, 0.13, 0.18]} castShadow />
        </group>
      )}
    </>
  );
}

function Chair({ w, d, h, c }: P) {
  const seatH = Math.min(0.47, h * 0.52);
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Leg key={i} p={[sx * (w / 2 - 0.04), sz * (d / 2 - 0.05)]} h={seatH - 0.03} r={0.013} c={DARK} />
      ))}
      <B p={[0, seatH - 0.015, 0.02]} s={[w - 0.02, 0.05, d - 0.06]} c={c} />
      <B p={[0, (seatH + h) / 2 + 0.03, -d / 2 + 0.035]} s={[w - 0.04, h - seatH - 0.06, 0.04]} c={c} />
      <B p={[-(w / 2 - 0.04), (seatH + h) / 2 - 0.05, -d / 2 + 0.03]} s={[0.025, h - seatH, 0.025]} c={DARK} />
      <B p={[w / 2 - 0.04, (seatH + h) / 2 - 0.05, -d / 2 + 0.03]} s={[0.025, h - seatH, 0.025]} c={DARK} />
    </>
  );
}

const BOOK_COLORS = ["#b5523b", "#3d6b8c", "#d8b04a", "#556b3f", "#7a4a6e", "#e0ddd4", "#2f3b4a", "#c77b52"];

function Shelf({ w, d, h, c, seed }: P & { seed: string }) {
  const n = Math.max(2, Math.round(h / 0.36));
  const gap = (h - 0.04) / n;
  // Deterministic "random" books so they don't shuffle on every render.
  let s = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const books: ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    if (rnd() < 0.2) continue;
    let x = -w / 2 + 0.03 + rnd() * 0.08;
    const end = w / 2 - 0.03 - rnd() * w * 0.4;
    while (x < end) {
      const bw = 0.02 + rnd() * 0.035;
      const bh = Math.min(gap - 0.04, 0.17 + rnd() * 0.1);
      books.push(<B key={books.length} p={[x + bw / 2, 0.03 + r * gap + bh / 2, 0]} s={[bw, bh, d * 0.75]} c={BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]} shadow={false} />);
      x += bw + 0.003;
    }
  }
  return (
    <>
      <B p={[-(w / 2 - 0.01), h / 2, 0]} s={[0.02, h, d]} c={c} />
      <B p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, d]} c={c} />
      <B p={[0, h / 2, -d / 2 + 0.006]} s={[w - 0.02, h, 0.012]} c={shade(c, -0.12)} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <B key={i} p={[0, 0.01 + i * gap + (i === n ? 0.01 : 0), 0]} s={[w - 0.02, 0.02, d]} c={c} />
      ))}
      {books}
    </>
  );
}

function Sofa({ w, d, h, c }: P) {
  const leg = 0.07;
  const arm = Math.min(0.2, w * 0.11);
  const armH = Math.min(h * 0.72, 0.64);
  const backD = Math.min(0.22, d * 0.26);
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.65));
  const sw = (w - 2 * arm) / seats;
  const seatTop = 0.44;
  const dark = shade(c, -0.15);
  return (
    <>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Leg key={i} p={[sx * (w / 2 - 0.05), sz * (d / 2 - 0.05)]} h={leg} r={0.018} c={DARK} />
      ))}
      <B p={[0, leg + 0.14, 0]} s={[w, 0.28, d]} c={dark} />
      <B p={[-(w / 2 - arm / 2), leg + (armH - leg) / 2, 0]} s={[arm, armH - leg, d]} c={dark} />
      <B p={[w / 2 - arm / 2, leg + (armH - leg) / 2, 0]} s={[arm, armH - leg, d]} c={dark} />
      <B p={[0, leg + (h - leg) / 2, -d / 2 + backD / 2]} s={[w - 2 * arm, h - leg, backD]} c={dark} />
      {Array.from({ length: seats }, (_, i) => {
        const x = -w / 2 + arm + sw * (i + 0.5);
        return (
          <group key={i}>
            <B p={[x, seatTop - 0.06, backD / 2 + 0.01]} s={[sw - 0.012, 0.12, d - backD - 0.02]} c={c} rough={0.95} />
            <B p={[x, seatTop + (h - seatTop) / 2 - 0.02, -d / 2 + backD + 0.07]} s={[sw - 0.02, h - seatTop - 0.06, 0.14]} c={c} rough={0.95} />
          </group>
        );
      })}
    </>
  );
}
