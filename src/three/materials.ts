import * as THREE from "three";

// Everything in the 3D view is built from a handful of shared geometries,
// scaled per mesh, and materials cached by colour. A room full of furniture
// then needs only a few dozen GPU materials and 3 geometries, which keeps an
// older laptop GPU happy.

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
export const BOX_EDGES = new THREE.EdgesGeometry(BOX);

interface MatOpts {
  roughness?: number;
  metalness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.roughness ?? ""}|${opts.metalness ?? ""}|${opts.opacity ?? ""}|${opts.emissive ?? ""}|${opts.emissiveIntensity ?? ""}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.82,
      metalness: opts.metalness ?? 0,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.opacity === undefined,
      emissive: opts.emissive ?? "#000000",
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    cache.set(key, m);
  }
  return m;
}

/** Lighter (amount > 0) or darker (amount < 0) version of a colour, as hex. */
export function shade(color: string, amount: number): string {
  const c = new THREE.Color(color);
  if (amount > 0) c.lerp(new THREE.Color("#ffffff"), amount);
  else c.lerp(new THREE.Color("#000000"), -amount);
  return "#" + c.getHexString();
}

/** Hides a wall from the camera but keeps its shadow (three skips shadows of invisible meshes). */
export const CUTAWAY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

export const LINE_SELECTED = new THREE.LineBasicMaterial({ color: "#4f46e5", depthTest: false, transparent: true });
export const LINE_ISSUE = new THREE.LineBasicMaterial({ color: "#e5484d", depthTest: false, transparent: true });

let floorTex: THREE.CanvasTexture | null = null;
/** Procedural wooden floor planks, drawn once on a small canvas. */
export function floorTexture(): THREE.CanvasTexture {
  if (floorTex) return floorTex;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const rows = 8;
  const h = 512 / rows;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300;
    while (x < 512) {
      const w = 220 + rnd() * 200;
      const l = 62 + rnd() * 8;
      g.fillStyle = `hsl(${30 + rnd() * 6}, ${38 + rnd() * 10}%, ${l}%)`;
      g.fillRect(x, r * h, w, h);
      g.strokeStyle = "rgba(60,40,20,0.35)";
      g.lineWidth = 2;
      g.strokeRect(x + 1, r * h + 1, w - 2, h - 2);
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = `rgba(90,60,30,${0.05 + rnd() * 0.06})`;
        g.beginPath();
        const yy = r * h + 6 + rnd() * (h - 12);
        g.moveTo(x, yy);
        g.bezierCurveTo(x + w / 3, yy + 3, x + (2 * w) / 3, yy - 3, x + w, yy);
        g.stroke();
      }
      x += w;
    }
  }
  floorTex = new THREE.CanvasTexture(c);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  return floorTex;
}
